import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client as clientTable, fieldMapping, instagramAccount, notionConnection } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { getActiveClientId } from "@/lib/active-client"
import { validateMetaCreds } from "@/lib/whatsapp-meta"
import { userWhatsappConfig } from "@/lib/db/schema"
import { Client } from "@notionhq/client"
import { checkInstagram, checkFacebook, checkLinkedIn } from "@/lib/integration-health"

type CheckResult = {
  id: string
  label: string
  status: "ok" | "warn" | "error"
  message: string
  details?: string
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

    // 4. Approval flow (only when configured) — validates the mapping
    // before posts hit the cron. Catches the most common setup errors:
    // typo in awaitingApprovalValue, wrong column type for clientContactField.
    if (mapping.awaitingApprovalValue) {
      // Approval status lives in approvalStatusField when set (workspaces
      // that keep production status separate from publish status — added
      // in #41). Falls back to statusField for legacy single-property
      // setups. The validation must read from whichever property the
      // cron will actually query.
      const approvalFieldName = mapping.approvalStatusField?.trim() || mapping.statusField
      const statusProp = dbProps[approvalFieldName]
      const statusOptions: string[] =
        statusProp?.type === "status"
          ? (statusProp.status?.options ?? []).map((o: any) => o.name)
          : statusProp?.type === "select"
            ? (statusProp.select?.options ?? []).map((o: any) => o.name)
            : []

      const awaitingExists = statusOptions.includes(mapping.awaitingApprovalValue)
      const revisionExists = !mapping.revisionRequestedValue || statusOptions.includes(mapping.revisionRequestedValue)

      if (!awaitingExists) {
        checks.push({
          id: `approval-status:${conn.id}`,
          label: `Aprovação · status disparador`,
          status: "error",
          message: `Status "${mapping.awaitingApprovalValue}" não existe nas opções do campo "${approvalFieldName}"`,
          details: statusOptions.length ? `Opções: ${statusOptions.join(", ")}` : "Campo de status não retornou opções",
        })
      } else {
        checks.push({
          id: `approval-status:${conn.id}`,
          label: `Aprovação · status disparador`,
          status: "ok",
          message: `"${mapping.awaitingApprovalValue}" encontrado nas opções de "${approvalFieldName}"`,
        })
      }

      if (mapping.revisionRequestedValue && !revisionExists) {
        checks.push({
          id: `approval-revision:${conn.id}`,
          label: `Aprovação · status "Pedir alterações"`,
          status: "error",
          message: `Status "${mapping.revisionRequestedValue}" não existe nas opções do campo "${approvalFieldName}"`,
        })
      }

      // clientContactField can be either a Relation (cron walks it
      // directly) or a Rollup that aggregates an underlying Relation
      // (cron resolves the rollup → source relation via DB schema —
      // see #54). Anything else and the cron silently skips.
      if (mapping.clientContactField) {
        const contactProp = dbProps[mapping.clientContactField]
        if (!contactProp) {
          checks.push({
            id: `approval-contact:${conn.id}`,
            label: `Aprovação · coluna de Contato`,
            status: "error",
            message: `Coluna "${mapping.clientContactField}" não existe no banco`,
          })
        } else if (contactProp.type === "relation") {
          checks.push({
            id: `approval-contact:${conn.id}`,
            label: `Aprovação · coluna de Contato`,
            status: "ok",
            message: `Relation OK (aponta pra DB com ${contactProp.relation?.database_id ? "id " + String(contactProp.relation.database_id).slice(0, 8) + "…" : "destino"})`,
          })
        } else if (contactProp.type === "rollup") {
          // Verify the rollup's underlying property is itself a relation,
          // else the resolveContact path returns null at runtime.
          const sourceRelName: string | undefined = contactProp.rollup?.relation_property_name
          const sourceProp = sourceRelName ? dbProps[sourceRelName] : null
          if (sourceProp?.type === "relation") {
            checks.push({
              id: `approval-contact:${conn.id}`,
              label: `Aprovação · coluna de Contato`,
              status: "ok",
              message: `Rollup OK (agrega a Relation "${sourceRelName}" → DB de Contato)`,
            })
          } else {
            checks.push({
              id: `approval-contact:${conn.id}`,
              label: `Aprovação · coluna de Contato`,
              status: "error",
              message: `Rollup "${mapping.clientContactField}" não agrega uma Relation${sourceRelName ? ` (agrega "${sourceRelName}", tipo "${sourceProp?.type ?? "?"}")` : ""}. Use uma propriedade Relation direto, ou um Rollup configurado em cima de uma Relation.`,
            })
          }
        } else {
          checks.push({
            id: `approval-contact:${conn.id}`,
            label: `Aprovação · coluna de Contato`,
            status: "error",
            message: `Coluna "${mapping.clientContactField}" é tipo "${contactProp.type}" — precisa ser Relation ou Rollup pra apontar pra DB de Contato`,
          })
        }
      } else {
        checks.push({
          id: `approval-contact:${conn.id}`,
          label: `Aprovação · coluna de Contato`,
          status: "warn",
          message: `clientContactField vazio em /settings → Aprovação. Sem ele o cron não consegue resolver o contato.`,
        })
      }

      // Agency Meta Cloud WhatsApp check — runs once per request (not per
      // workspace). One WABA per user, shared across all clients.
      const alreadyChecked = checks.some((c) => c.id === "approval-whatsapp")
      if (!alreadyChecked) {
        const [c] = await db
          .select({
            token: userWhatsappConfig.metaWaToken,
            phoneId: userWhatsappConfig.metaPhoneNumberId,
            template: userWhatsappConfig.metaTemplateName,
          })
          .from(userWhatsappConfig)
          .where(eq(userWhatsappConfig.userId, session.user.id))

        if (!c?.token || !c?.phoneId || !c?.template) {
          const missing: string[] = []
          if (!c?.token) missing.push("token")
          if (!c?.phoneId) missing.push("phone_number_id")
          if (!c?.template) missing.push("template")
          checks.push({
            id: "approval-whatsapp",
            label: `Aprovação · WhatsApp da agência`,
            status: "warn",
            message: `Faltando: ${missing.join(", ")}. Sem isso, modo automático cai pra envio manual (wa.me).`,
          })
        } else {
          const result = await validateMetaCreds(c.token, c.phoneId)
          checks.push({
            id: "approval-whatsapp",
            label: `Aprovação · WhatsApp da agência`,
            status: result.ok ? "ok" : "error",
            message: result.ok
              ? `Credenciais OK — ${result.displayPhoneNumber} (${result.verifiedName})`
              : `Credenciais rejeitadas: ${result.reason}`,
          })
        }
      }
    }

    // 5. At least 1 post in "ready" state?
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
