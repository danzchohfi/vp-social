import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim()
  if (body.logoUrl !== undefined) update.logoUrl = body.logoUrl
  // ManyChat config — sent by /clients UI to enable the WhatsApp approval
  // dispatch for this client. Either string or null (= clear).
  if (body.manychatApiKey !== undefined) {
    update.manychatApiKey = typeof body.manychatApiKey === "string" && body.manychatApiKey.trim()
      ? body.manychatApiKey.trim()
      : null
  }
  if (body.manychatApprovalFlowNs !== undefined) {
    update.manychatApprovalFlowNs = typeof body.manychatApprovalFlowNs === "string" && body.manychatApprovalFlowNs.trim()
      ? body.manychatApprovalFlowNs.trim()
      : null
  }
  // Approval-notification mode. Only accept the two known values; null
  // clears (treated as auto_manychat default by the cron). Anything else
  // is a 400 to surface UI bugs early.
  if (body.approvalNotificationMode !== undefined) {
    const v = body.approvalNotificationMode
    if (v !== null && v !== "auto_manychat" && v !== "manual_whatsapp") {
      return NextResponse.json({ error: "approvalNotificationMode inválido" }, { status: 400 })
    }
    update.approvalNotificationMode = v
  }
  // Approval dispatch timing: 'auto' (cron fires WA per pending post) or
  // 'manual' (cron creates links silently; agency clicks "Notificar
  // pendentes" on /dashboard to send a digest). NULL clears = auto default.
  if (body.approvalDispatchMode !== undefined) {
    const v = body.approvalDispatchMode
    if (v !== null && v !== "auto" && v !== "manual") {
      return NextResponse.json({ error: "approvalDispatchMode inválido" }, { status: 400 })
    }
    update.approvalDispatchMode = v
  }
  // Custom wa.me template for manual mode. Empty string clears (back to
  // hardcoded default). We don't validate placeholders — if the user
  // skips one their message just renders without that piece.
  if (body.manualWhatsappTemplate !== undefined) {
    update.manualWhatsappTemplate = typeof body.manualWhatsappTemplate === "string" && body.manualWhatsappTemplate.trim()
      ? body.manualWhatsappTemplate
      : null
  }
  // Pause-publish toggle. When TRUE, the cron skips this client entirely.
  if (body.publishingPaused !== undefined) {
    update.publishingPaused = body.publishingPaused === true
  }
  // WhatsApp dispatch provider per client. Either ManyChat (legacy)
  // or Meta Cloud API direct. Restrict accepted values explicitly
  // so a malformed UI payload can't write garbage.
  if (body.whatsappProvider !== undefined) {
    const v = body.whatsappProvider
    if (v !== "manychat" && v !== "meta_cloud") {
      return NextResponse.json({ error: "whatsappProvider inválido" }, { status: 400 })
    }
    update.whatsappProvider = v
  }
  // Meta WhatsApp Cloud credentials. Empty string → null so the
  // dispatcher's "not configured" check fires correctly.
  if (body.metaWaToken !== undefined) {
    update.metaWaToken = typeof body.metaWaToken === "string" && body.metaWaToken.trim() ? body.metaWaToken.trim() : null
  }
  if (body.metaPhoneNumberId !== undefined) {
    update.metaPhoneNumberId = typeof body.metaPhoneNumberId === "string" && body.metaPhoneNumberId.trim() ? body.metaPhoneNumberId.trim() : null
  }
  if (body.metaTemplateName !== undefined) {
    update.metaTemplateName = typeof body.metaTemplateName === "string" && body.metaTemplateName.trim() ? body.metaTemplateName.trim() : null
  }
  if (body.metaTemplateLanguage !== undefined) {
    update.metaTemplateLanguage = typeof body.metaTemplateLanguage === "string" && body.metaTemplateLanguage.trim() ? body.metaTemplateLanguage.trim() : "pt_BR"
  }
  // Notion `conta` values that belong to this client. Used by
  // /api/notion/scheduled + trigger/publish.ts to route posts to the
  // right tenant without name-matching heuristics. Empty array clears
  // the mapping (back to legacy behavior).
  if (body.notionContaValues !== undefined) {
    if (!Array.isArray(body.notionContaValues)) {
      return NextResponse.json({ error: "notionContaValues deve ser uma lista de strings" }, { status: 400 })
    }
    const cleaned = body.notionContaValues
      .map((v: unknown) => (typeof v === "string" ? v.trim() : ""))
      .filter((v: string) => v.length > 0)
    update.notionContaValues = cleaned.length > 0 ? cleaned : null
  }

  await db
    .update(client)
    .set(update)
    .where(and(eq(client.id, id), eq(client.userId, session.user.id)))

  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const all = await db.select().from(client).where(eq(client.userId, session.user.id))
  if (all.length <= 1) {
    return NextResponse.json(
      { error: "Você precisa manter pelo menos um cliente." },
      { status: 400 }
    )
  }

  await db
    .delete(client)
    .where(and(eq(client.id, id), eq(client.userId, session.user.id)))

  return NextResponse.json({ ok: true })
}
