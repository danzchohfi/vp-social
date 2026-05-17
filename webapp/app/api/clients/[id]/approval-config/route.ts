import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client, fieldMapping, notionConnection, userWhatsappConfig } from "@/lib/db/schema"
import { eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getOrCreateClientCalendarToken } from "@/lib/approval-link"
import { userIsClientOwner } from "@/lib/active-client"

export type ApprovalConfigStatus = "configured" | "partial" | "missing"

// Returns the per-client approval routing config + a derived completeness
// status the UI uses to render the green/yellow/red pill on the client
// card and to gate the "tudo certo" CTA in the panel.
//
// Status is derived (not stored) so it stays in sync with the source
// data — agency can flip a Notion field mapping in /settings and the
// pill updates on next refresh without an explicit "save" anywhere.
//
// Owner-only: surfaces whether the agency-level WhatsApp config is set,
// which is sensitive (token presence).
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
      userId: client.userId,
      approvalNotificationMode: client.approvalNotificationMode,
      approvalDispatchMode: client.approvalDispatchMode,
      manualWhatsappTemplate: client.manualWhatsappTemplate,
      briefingFormUrl: client.briefingFormUrl,
      briefingNotionPageId: client.briefingNotionPageId,
    })
    .from(client)
    .where(eq(client.id, id))

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Agency-level WhatsApp config. One per user — all clients share it.
  const [waCfg] = await db
    .select({
      metaWaToken: userWhatsappConfig.metaWaToken,
      metaPhoneNumberId: userWhatsappConfig.metaPhoneNumberId,
      metaTemplateName: userWhatsappConfig.metaTemplateName,
    })
    .from(userWhatsappConfig)
    .where(eq(userWhatsappConfig.userId, row.userId))
  const whatsappConfigured = !!(waCfg?.metaWaToken && waCfg?.metaPhoneNumberId && waCfg?.metaTemplateName)

  // Lazy create — first call generates the token. Idempotent.
  const calendarToken = await getOrCreateClientCalendarToken(id)

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
        })
        .from(fieldMapping)
        .where(inArray(fieldMapping.connectionId, connectionIds))
    : []

  const mappingByConn = new Map(mappings.map((m) => [m.connectionId, m]))

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
  ]
  const connectionStatus: ConnStatus[] = connections.map((c) => {
    const m = mappingByConn.get(c.id)
    const missing: string[] = []
    if (!m) {
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

  // 'manual_whatsapp' = legacy column value kept for old rows. New writes
  // use 'manual_wame'. Either way we treat as manual here.
  const mode = (row.approvalNotificationMode === "manual_whatsapp" || row.approvalNotificationMode === "manual_wame"
    ? "manual_wame"
    : "auto") as "auto" | "manual_wame"
  const anyNotionReady = connectionStatus.some((c) => c.notionReady)
  const anyNotionPartial = connectionStatus.some(
    (c) => !c.notionReady && c.missingNotionFields.length < 3,
  )

  let status: ApprovalConfigStatus
  if (connections.length === 0) {
    status = "missing"
  } else if (anyNotionReady && (mode === "manual_wame" || whatsappConfigured)) {
    status = "configured"
  } else if (anyNotionReady || anyNotionPartial || whatsappConfigured) {
    status = "partial"
  } else {
    status = "missing"
  }

  return NextResponse.json({
    clientName: row.name,
    calendarToken,
    calendarPath: `/c/${calendarToken}`,
    approvalNotificationMode: mode,
    approvalDispatchMode: row.approvalDispatchMode === "manual" ? "manual" : "auto",
    manualWhatsappTemplate: row.manualWhatsappTemplate ?? "",
    briefingFormUrl: row.briefingFormUrl ?? "",
    briefingNotionPageId: row.briefingNotionPageId ?? "",
    whatsappConfigured,
    connections: connectionStatus,
    status,
    nextStepHint: deriveNextStep({
      connections: connectionStatus,
      mode,
      whatsappConfigured,
    }),
  })
}

function deriveNextStep(args: {
  connections: Array<{ notionReady: boolean; missingNotionFields: string[]; workspaceName: string }>
  mode: "auto" | "manual_wame"
  whatsappConfigured: boolean
}): string | null {
  if (args.connections.length === 0) {
    return "Conecte um workspace do Notion antes de configurar aprovações."
  }
  const firstUnready = args.connections.find((c) => !c.notionReady)
  if (firstUnready) {
    const fields = firstUnready.missingNotionFields.slice(0, 2).join(", ")
    return `Em /settings → ${firstUnready.workspaceName}, preencha: ${fields}${firstUnready.missingNotionFields.length > 2 ? "..." : ""}`
  }
  if (args.mode === "auto" && !args.whatsappConfigured) {
    return "Configure o WhatsApp da agência em /settings (token + phone_number_id + template) — ou troque pra modo manual nesse cliente."
  }
  return null
}
