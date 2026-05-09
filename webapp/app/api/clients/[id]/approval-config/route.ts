import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client, fieldMapping, notionConnection } from "@/lib/db/schema"
import { eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getOrCreateClientCalendarToken } from "@/lib/approval-link"
import { userIsClientOwner } from "@/lib/active-client"

export type ApprovalConfigStatus = "configured" | "partial" | "missing"

// Returns the per-client approval flow config + a derived completeness
// status the UI uses to render the green/yellow/red pill on the client
// card and to gate the "tudo certo" CTA in the panel.
//
// Status is derived (not stored) so it stays in sync with the source
// data — agency can flip a Notion field mapping in /settings and the
// pill updates on next refresh without an explicit "save" anywhere.
//
// Owner-only because the API key is sensitive.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const isOwner = await userIsClientOwner(session.user.id, id)
  if (!isOwner) {
    return NextResponse.json({ error: "Apenas o owner do cliente pode ver/editar a config de aprovação." }, { status: 403 })
  }

  const [row] = await db
    .select({
      name: client.name,
      manychatApiKey: client.manychatApiKey,
      manychatApprovalFlowNs: client.manychatApprovalFlowNs,
      approvalNotificationMode: client.approvalNotificationMode,
      manualWhatsappTemplate: client.manualWhatsappTemplate,
    })
    .from(client)
    .where(eq(client.id, id))

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Lazy create — first call generates the token. Idempotent.
  const calendarToken = await getOrCreateClientCalendarToken(id)

  // Connections + their fieldMappings — drives the per-connection
  // checklist below. Each connection needs awaitingApprovalValue +
  // revisionRequestedValue + clientContactField + contactEmailField +
  // contactPhoneField for the cron approval sweep to fire.
  const connections = await db
    .select({
      id: notionConnection.id,
      workspaceName: notionConnection.workspaceName,
      databaseName: notionConnection.databaseName,
    })
    .from(notionConnection)
    .where(eq(notionConnection.clientId, id))

  const connectionIds = connections.map((c) => c.id)
  const mappings = connectionIds.length > 0
    ? await db
        .select({
          connectionId: fieldMapping.connectionId,
          awaitingApprovalValue: fieldMapping.awaitingApprovalValue,
          revisionRequestedValue: fieldMapping.revisionRequestedValue,
          clientContactField: fieldMapping.clientContactField,
          contactEmailField: fieldMapping.contactEmailField,
          contactPhoneField: fieldMapping.contactPhoneField,
        })
        .from(fieldMapping)
        .where(inArray(fieldMapping.connectionId, connectionIds))
    : []

  const mappingByConn = new Map(mappings.map((m) => [m.connectionId, m]))

  // Per-connection completeness — a connection is "ready" when all 5
  // approval fields are non-empty.
  type ConnStatus = {
    id: string
    workspaceName: string
    databaseName: string | null
    notionReady: boolean
    missingNotionFields: string[]
  }
  type Mapping = (typeof mappings)[number]
  type ApprovalKey = Exclude<keyof Mapping, "connectionId">
  const required: Array<[ApprovalKey, string]> = [
    ["awaitingApprovalValue", "Status que dispara aprovação"],
    ["revisionRequestedValue", 'Status quando "pedir alterações"'],
    ["clientContactField", "Coluna de relação Contato"],
    ["contactEmailField", "Coluna de email"],
    ["contactPhoneField", "Coluna de WhatsApp"],
  ]
  const connectionStatus: ConnStatus[] = connections.map((c) => {
    const m = mappingByConn.get(c.id)
    const missing: string[] = []
    if (!m) {
      // No mapping row at all → all 5 missing.
      for (const [, label] of required) missing.push(label)
    } else {
      for (const [key, label] of required) {
        const val = m[key]
        if (typeof val !== "string" || !val.trim()) missing.push(label)
      }
    }
    return {
      id: c.id,
      workspaceName: c.workspaceName,
      databaseName: c.databaseName,
      notionReady: missing.length === 0,
      missingNotionFields: missing,
    }
  })

  // Derive overall status:
  //   'configured'  — at least one connection's Notion mapping is ready
  //                   AND (mode='manual_whatsapp' OR ManyChat creds set)
  //   'partial'     — some Notion mapping done, but not enough to dispatch
  //   'missing'     — no Notion mapping AND no Notion connections
  const mode = (row.approvalNotificationMode ?? "auto_manychat") as
    | "auto_manychat"
    | "manual_whatsapp"
  const hasManychat = !!row.manychatApiKey?.trim() && !!row.manychatApprovalFlowNs?.trim()
  const anyNotionReady = connectionStatus.some((c) => c.notionReady)
  const anyNotionPartial = connectionStatus.some(
    (c) => !c.notionReady && c.missingNotionFields.length < 5,
  )

  let status: ApprovalConfigStatus
  if (connections.length === 0) {
    status = "missing"
  } else if (anyNotionReady && (mode === "manual_whatsapp" || hasManychat)) {
    status = "configured"
  } else if (anyNotionReady || anyNotionPartial || hasManychat) {
    status = "partial"
  } else {
    status = "missing"
  }

  return NextResponse.json({
    clientName: row.name,
    calendarToken,
    calendarPath: `/c/${calendarToken}`,
    manychatApiKey: row.manychatApiKey ?? "",
    manychatApprovalFlowNs: row.manychatApprovalFlowNs ?? "",
    approvalNotificationMode: mode,
    manualWhatsappTemplate: row.manualWhatsappTemplate ?? "",
    connections: connectionStatus,
    status,
    // Highest-impact missing-thing summary for the UI to render in one line.
    nextStepHint: deriveNextStep({
      connections: connectionStatus,
      mode,
      hasManychat,
    }),
  })
}

function deriveNextStep(args: {
  connections: Array<{ notionReady: boolean; missingNotionFields: string[]; workspaceName: string }>
  mode: "auto_manychat" | "manual_whatsapp"
  hasManychat: boolean
}): string | null {
  if (args.connections.length === 0) {
    return "Conecte um workspace do Notion antes de configurar aprovações."
  }
  const firstUnready = args.connections.find((c) => !c.notionReady)
  if (firstUnready) {
    const fields = firstUnready.missingNotionFields.slice(0, 2).join(", ")
    return `Em /settings → ${firstUnready.workspaceName}, preencha: ${fields}${firstUnready.missingNotionFields.length > 2 ? "..." : ""}`
  }
  if (args.mode === "auto_manychat" && !args.hasManychat) {
    return "Cole a API key do ManyChat e o Flow Namespace abaixo (ou troque pra modo manual)."
  }
  return null
}
