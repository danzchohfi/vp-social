import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  client,
  fieldMapping,
  instagramAccount,
  notionConnection,
  publishLog,
} from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userHasClientAccess } from "@/lib/active-client"

// Aggregated setup-completeness check for a client. Drives the
// onboarding checklist on /clients (each step shows ✓/⏳/missing with
// a one-click action link). Reduces "I forgot to configure X and now
// nothing publishes" mistakes.
//
// Steps (in onboarding order):
//   1. Notion connection has a database selected
//   2. Field mapping has the basic publish fields filled (status,
//      ready value, date, account)
//   3. At least one active social account connected (IG/FB/YT/TT/LI)
//   4. Approval flow: configured OR explicitly in manual mode
//   5. At least one post successfully published
//
// Status per step:
//   "done"     — fully OK
//   "partial"  — partially configured (e.g. mapping has some fields)
//   "missing"  — nothing yet
//
// Owner-only because exposing per-step state could leak ManyChat
// status from a sibling client otherwise.

export type SetupStep = {
  key: "notion" | "mapping" | "accounts" | "approval" | "first_publish"
  label: string
  status: "done" | "partial" | "missing"
  action: { label: string; href: string }
  detail?: string | null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const ok = await userHasClientAccess(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const [c] = await db.select().from(client).where(eq(client.id, id))
  if (!c) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

  // Pull everything we need in parallel to keep the request fast.
  const [connections, accounts, oneSuccess] = await Promise.all([
    db.select().from(notionConnection).where(eq(notionConnection.clientId, id)),
    db.select().from(instagramAccount).where(eq(instagramAccount.clientId, id)),
    db
      .select({ id: publishLog.id })
      .from(publishLog)
      .where(and(eq(publishLog.clientId, id), eq(publishLog.status, "published")))
      .limit(1),
  ])

  const ready = connections.filter((c) => c.databaseId)
  const connectionIds = ready.map((c) => c.id)
  const mappings = connectionIds.length > 0
    ? await db
        .select()
        .from(fieldMapping)
        .where(inArray(fieldMapping.connectionId, connectionIds))
    : []

  // Step 1 — Notion
  const notionStep: SetupStep = (() => {
    if (connections.length === 0) {
      return {
        key: "notion",
        label: "Conectar Notion",
        status: "missing",
        action: { label: "Conectar agora", href: "/onboarding" },
      }
    }
    if (ready.length === 0) {
      return {
        key: "notion",
        label: "Escolher banco do Notion",
        status: "partial",
        action: { label: "Escolher banco", href: "/settings" },
        detail: `${connections.length} workspace(s) conectado(s) sem banco escolhido.`,
      }
    }
    return {
      key: "notion",
      label: "Notion conectado",
      status: "done",
      // Sends the user back through Notion's OAuth so they can pick
      // additional pages/DBs (e.g. add the Contatos DB to an existing
      // integration). Clicking the previous href="/settings" was a
      // no-op since the user was already on /settings.
      action: { label: "Adicionar mais bancos", href: "/api/notion/auth-url?redirect=1" },
      detail: `${ready.length} banco(s) conectado(s) · clique pra adicionar mais (ex.: DB Contatos)`,
    }
  })()

  // Step 2 — Mapping (basic publish fields)
  const mappingStep: SetupStep = (() => {
    if (ready.length === 0) {
      return {
        key: "mapping",
        label: "Mapear campos do Notion",
        status: "missing",
        action: { label: "Configurar", href: "/settings" },
        detail: "Conecte um banco antes",
      }
    }
    // For each connection, check if mapping covers the must-haves.
    const required: Array<keyof typeof fieldMapping.$inferSelect> = [
      "statusField",
      "statusReadyValue",
      "dateField",
      "accountField",
    ]
    let okCount = 0
    let partialCount = 0
    for (const conn of ready) {
      const m = mappings.find((mm) => mm.connectionId === conn.id)
      if (!m) continue
      const filled = required.filter((r) => {
        const v = (m as any)[r]
        return typeof v === "string" && v.trim().length > 0
      }).length
      if (filled === required.length) okCount++
      else if (filled > 0) partialCount++
    }
    if (okCount === ready.length) {
      return {
        key: "mapping",
        label: "Campos do Notion mapeados",
        status: "done",
        action: { label: "Revisar", href: "/settings" },
      }
    }
    if (okCount > 0 || partialCount > 0) {
      return {
        key: "mapping",
        label: "Campos do Notion (parcial)",
        status: "partial",
        action: { label: "Continuar", href: "/settings" },
        detail: `${okCount}/${ready.length} workspace(s) completos. Use o auto-detect.`,
      }
    }
    return {
      key: "mapping",
      label: "Mapear campos do Notion",
      status: "missing",
      action: { label: "Auto-detectar", href: "/settings" },
    }
  })()

  // Step 3 — Social accounts
  const activeAccounts = accounts.filter((a) => a.active)
  const accountsStep: SetupStep = (() => {
    if (activeAccounts.length === 0) {
      return {
        key: "accounts",
        label: "Conectar conta social",
        status: "missing",
        action: { label: "Conectar", href: "/accounts" },
        detail: "Pelo menos uma conta IG/FB/YT/TT/LI",
      }
    }
    const platforms = Array.from(new Set(activeAccounts.map((a) => a.platform)))
    return {
      key: "accounts",
      label: `${activeAccounts.length} conta(s) conectada(s)`,
      status: "done",
      action: { label: "Gerenciar", href: "/accounts" },
      detail: platforms.join(", "),
    }
  })()

  // Step 4 — Approval. Reuses the logic from approval-config: if the
  // client is in manual mode, it's "done" with no further setup needed
  // beyond the Notion mapping. If auto, requires manychatApiKey + flow_ns.
  const approvalStep: SetupStep = (() => {
    const mode = (c.approvalNotificationMode ?? "auto_manychat") as "auto_manychat" | "manual_whatsapp"
    if (mode === "manual_whatsapp") {
      return {
        key: "approval",
        label: "Aprovação: modo manual",
        status: "done",
        action: { label: "Trocar pra automático", href: "/clients" },
        detail: "Você envia o WhatsApp manualmente em /scheduled.",
      }
    }
    const hasKey = !!c.manychatApiKey?.trim()
    const hasFlow = !!c.manychatApprovalFlowNs?.trim()
    if (hasKey && hasFlow) {
      return {
        key: "approval",
        label: "Aprovação automática (ManyChat)",
        status: "done",
        action: { label: "Testar", href: "/clients" },
      }
    }
    if (hasKey || hasFlow) {
      return {
        key: "approval",
        label: "Aprovação (parcial)",
        status: "partial",
        action: { label: "Continuar", href: "/clients" },
        detail: hasKey ? "Falta escolher um Flow" : "Falta a API key do ManyChat",
      }
    }
    return {
      key: "approval",
      label: "Configurar aprovação",
      status: "missing",
      action: { label: "Configurar", href: "/clients" },
      detail: "Automático via ManyChat ou manual via wa.me",
    }
  })()

  // Step 5 — First publish
  const firstPublishStep: SetupStep = (() => {
    if (oneSuccess.length > 0) {
      return {
        key: "first_publish",
        label: "Primeiro post publicado",
        status: "done",
        action: { label: "Ver histórico", href: "/scheduled?filter=published" },
      }
    }
    return {
      key: "first_publish",
      label: "Publicar primeiro post",
      status: "missing",
      action: { label: "Ver agendamento", href: "/scheduled" },
      detail: "Mude o status de um post pra Agendamento no Notion",
    }
  })()

  const steps: SetupStep[] = [notionStep, mappingStep, accountsStep, approvalStep, firstPublishStep]
  const doneCount = steps.filter((s) => s.status === "done").length
  const percentComplete = Math.round((doneCount / steps.length) * 100)

  return NextResponse.json({
    clientName: c.name,
    publishingPaused: c.publishingPaused,
    steps,
    percentComplete,
    doneCount,
    totalSteps: steps.length,
  })
}
