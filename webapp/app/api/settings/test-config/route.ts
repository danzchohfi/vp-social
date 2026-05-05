import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { fieldMapping, instagramAccount, notionConnection } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { getActiveClientId } from "@/lib/active-client"
import { Client } from "@notionhq/client"

type CheckResult = {
  id: string
  label: string
  status: "ok" | "warn" | "error"
  message: string
  details?: string
}

// Probe a single integration credential. The error path is per-platform; we
// don't need full SDKs, just a "GET /me" type call with the saved token.
async function checkInstagram(token: string, igAccountId: string): Promise<{ ok: boolean; message: string }> {
  if (!igAccountId) return { ok: false, message: "instagramBusinessAccountId vazio" }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${igAccountId}?fields=username,followers_count&access_token=${token}`)
    const data = await res.json()
    if (!res.ok || data.error) return { ok: false, message: data.error?.message ?? `HTTP ${res.status}` }
    return { ok: true, message: data.username ? `@${data.username}` : "OK" }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Network error" }
  }
}

async function checkFacebook(token: string, pageId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=name&access_token=${token}`)
    const data = await res.json()
    if (!res.ok || data.error) return { ok: false, message: data.error?.message ?? `HTTP ${res.status}` }
    return { ok: true, message: data.name ?? "OK" }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Network error" }
  }
}

async function checkLinkedIn(token: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("https://api.linkedin.com/v2/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 100)}` }
    }
    const data = await res.json()
    return { ok: true, message: data.localizedFirstName ? `${data.localizedFirstName} ${data.localizedLastName ?? ""}`.trim() : "OK" }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Network error" }
  }
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const clientId = await getActiveClientId(userId)
  const checks: CheckResult[] = []

  // ─── Notion connections ──────────────────────────────────────────
  const connections = await db
    .select()
    .from(notionConnection)
    .where(and(eq(notionConnection.userId, userId), eq(notionConnection.clientId, clientId)))

  if (!connections.length) {
    checks.push({
      id: "notion",
      label: "Notion",
      status: "error",
      message: "Nenhuma conexão Notion configurada para este cliente.",
    })
  }

  for (const conn of connections) {
    // 1. Token valid?
    try {
      const probe = new Client({ auth: conn.accessToken })
      const me = await probe.users.me({})
      checks.push({
        id: `notion:${conn.id}`,
        label: `Notion (${conn.workspaceName})`,
        status: "ok",
        message: `Conectado como ${(me as any).bot?.owner?.user?.name ?? (me as any).name ?? "OK"}`,
      })
    } catch (e) {
      checks.push({
        id: `notion:${conn.id}`,
        label: `Notion (${conn.workspaceName})`,
        status: "error",
        message: "Token inválido ou expirado",
        details: e instanceof Error ? e.message : String(e),
      })
      continue // skip db/mapping checks for this connection
    }

    // 2. Database accessible?
    if (!conn.databaseId) {
      checks.push({
        id: `db:${conn.id}`,
        label: `Banco de dados (${conn.workspaceName})`,
        status: "warn",
        message: "Nenhum banco selecionado neste workspace",
      })
      continue
    }

    let dbProps: Record<string, any> | null = null
    try {
      const probe = new Client({ auth: conn.accessToken })
      const database = await probe.databases.retrieve({ database_id: conn.databaseId })
      dbProps = (database as any).properties as Record<string, any>
      const dbName = (database as any).title?.[0]?.plain_text ?? conn.databaseName ?? "sem nome"
      checks.push({
        id: `db:${conn.id}`,
        label: `Banco de dados`,
        status: "ok",
        message: `Acesso OK: "${dbName}" (${Object.keys(dbProps).length} propriedades)`,
      })
    } catch (e) {
      checks.push({
        id: `db:${conn.id}`,
        label: `Banco de dados (${conn.workspaceName})`,
        status: "error",
        message: "Não foi possível acessar o banco",
        details: e instanceof Error ? e.message : String(e),
      })
      continue
    }

    // 3. Mapping fields exist with the right types?
    const [mappingRow] = await db
      .select()
      .from(fieldMapping)
      .where(eq(fieldMapping.connectionId, conn.id))

    const mapping = mappingRow ?? DEFAULT_MAPPING
    const requiredFields: Array<{ key: string; expectedType?: string; required: boolean }> = [
      { key: mapping.titleField, expectedType: "title", required: true },
      { key: mapping.statusField, expectedType: "status", required: true },
      { key: mapping.dateField, expectedType: "date", required: true },
      { key: mapping.accountField, required: true },
      { key: mapping.publicarEmField, expectedType: "multi_select", required: true },
      { key: mapping.captionField, required: false },
    ]

    const missing = requiredFields.filter((f) => f.key && !dbProps![f.key])
    const wrongType = requiredFields.filter(
      (f) => f.key && dbProps![f.key] && f.expectedType && dbProps![f.key].type !== f.expectedType
    )

    if (missing.length || wrongType.length) {
      const issues: string[] = []
      if (missing.length) issues.push(`Faltando: ${missing.map((m) => m.key).join(", ")}`)
      if (wrongType.length) {
        issues.push(
          `Tipo errado: ${wrongType.map((w) => `${w.key} (esperado ${w.expectedType}, achou ${dbProps![w.key].type})`).join(", ")}`
        )
      }
      checks.push({
        id: `mapping:${conn.id}`,
        label: `Mapeamento`,
        status: missing.some((m) => requiredFields.find((r) => r.key === m.key)?.required) || wrongType.length ? "error" : "warn",
        message: issues.join(" · "),
      })
    } else {
      checks.push({
        id: `mapping:${conn.id}`,
        label: `Mapeamento`,
        status: "ok",
        message: "Todos os campos obrigatórios encontrados com tipo correto",
      })
    }

    // 4. At least 1 post in "ready" state?
    try {
      const notion = createNotionClient(conn.accessToken)
      const ready = await notion.getReadyPosts(conn.databaseId, mapping)
      checks.push({
        id: `ready:${conn.id}`,
        label: `Posts prontos`,
        status: ready.length > 0 ? "ok" : "warn",
        message: ready.length > 0
          ? `${ready.length} post(s) com status "${mapping.statusReadyValue}" e data <= agora`
          : `Nenhum post pronto (status "${mapping.statusReadyValue}" + data <= agora)`,
      })
    } catch (e) {
      checks.push({
        id: `ready:${conn.id}`,
        label: `Posts prontos`,
        status: "warn",
        message: "Não foi possível contar posts prontos",
        details: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // ─── Social accounts ──────────────────────────────────────────────
  const accounts = await db
    .select()
    .from(instagramAccount)
    .where(and(eq(instagramAccount.userId, userId), eq(instagramAccount.clientId, clientId), eq(instagramAccount.active, true)))

  if (!accounts.length) {
    checks.push({
      id: "accounts",
      label: "Contas sociais",
      status: "error",
      message: "Nenhuma conta social ativa neste cliente",
    })
  }

  for (const acc of accounts) {
    let result: { ok: boolean; message: string }
    if (acc.platform === "instagram") {
      result = await checkInstagram(acc.pageAccessToken, acc.instagramBusinessAccountId)
    } else if (acc.platform === "facebook") {
      result = await checkFacebook(acc.pageAccessToken, acc.pageId)
    } else if (acc.platform === "linkedin") {
      result = await checkLinkedIn(acc.pageAccessToken)
    } else {
      // YouTube + TikTok use refresh tokens; skipping the live ping to avoid
      // burning a token cycle. We still surface the row exists.
      result = { ok: true, message: "Token salvo (validação pulada)" }
    }
    checks.push({
      id: `account:${acc.id}`,
      label: `${acc.platform} · ${acc.conta}`,
      status: result.ok ? "ok" : "error",
      message: result.message,
    })
  }

  return NextResponse.json({ checks })
}
