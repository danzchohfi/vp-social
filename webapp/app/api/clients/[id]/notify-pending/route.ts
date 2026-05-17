import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { approvalLink, client as clientTable, notionConnection } from "@/lib/db/schema"
import { and, eq, inArray, isNull, or } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { validatePhoneE164 } from "@/lib/phone"
import { dispatchApprovalRequest, getUserWhatsappConfig, isConfigured } from "@/lib/whatsapp-dispatch"
import { createNotionClient } from "@/lib/notion"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://producao.app"

// Manual approval-notification trigger. Used when client.approvalDispatchMode
// is 'manual' — the cron has been creating approvalLink rows without firing
// WhatsApp, and the agency clicks "Notificar pendentes" on /dashboard when
// they decide it makes sense to nudge the client.
//
// Behavior:
//   - Sends ONE digest WhatsApp per distinct phone (handles the case where
//     multiple posts go to the same approver — most common).
//   - When approvers differ per-post (rare), sends one message per approver
//     with the posts they're responsible for.
//   - Uses the agency-level Meta Cloud config (userWhatsappConfig). One
//     WABA per agency, all clients share it.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const isOwner = await userIsClientOwner(session.user.id, id)
  if (!isOwner) {
    return NextResponse.json({ error: "Apenas o owner pode notificar" }, { status: 403 })
  }

  const [row] = await db
    .select({ name: clientTable.name, userId: clientTable.userId })
    .from(clientTable)
    .where(eq(clientTable.id, id))
  if (!row) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

  const waConfig = await getUserWhatsappConfig(row.userId)
  if (!isConfigured(waConfig)) {
    return NextResponse.json({
      error: "WhatsApp da agência não configurado em /settings → WhatsApp da agência (faltam token, phone_number_id ou template).",
    }, { status: 400 })
  }

  // Pending approvalLinks for this client = decision IS NULL AND not yet
  // sent (sentVia null or 'none'). Other sentVia values were already handled.
  const pending = await db
    .select()
    .from(approvalLink)
    .where(and(
      eq(approvalLink.clientId, id),
      isNull(approvalLink.decision),
      or(isNull(approvalLink.sentVia), eq(approvalLink.sentVia, "none")),
    ))

  if (pending.length === 0) {
    return NextResponse.json({ dispatched: 0, skipped: 0, errors: [], reason: "no_pending" })
  }

  // Group by phone (case-normalized) so we send ONE digest per recipient.
  // Each phone gets a list of post titles + an approval link. For >1 post
  // we point the WhatsApp at /c/[token] (the client's permanent calendar)
  // which lists everything pending; for exactly 1, we keep the per-post
  // /approve/[token] link.
  const groups = new Map<string, typeof pending>()
  const noPhone: typeof pending = []
  for (const link of pending) {
    if (!link.contactPhone) {
      noPhone.push(link)
      continue
    }
    const v = validatePhoneE164(link.contactPhone)
    if (!v.valid) {
      noPhone.push(link)
      continue
    }
    const key = link.contactPhone.replace(/\D/g, "")
    const arr = groups.get(key) ?? []
    arr.push(link)
    groups.set(key, arr)
  }

  const [clientWithToken] = await db
    .select({ publicCalendarToken: clientTable.publicCalendarToken })
    .from(clientTable)
    .where(eq(clientTable.id, id))
  const calendarUrl = clientWithToken?.publicCalendarToken
    ? `${APP_URL}/c/${clientWithToken.publicCalendarToken}`
    : null

  let dispatched = 0
  const errors: Array<{ phone: string; reason: string }> = []
  const dispatchedIds: string[] = []

  for (const [phone, links] of groups.entries()) {
    const first = links[0]
    const isBatch = links.length > 1
    const approvalUrl = isBatch
      ? (calendarUrl ?? `${APP_URL}/approve/${first.token}`)
      : `${APP_URL}/approve/${first.token}`
    const titleField = isBatch
      ? `${links.length} posts aguardando sua aprovação`
      : (first.postTitle || "Post sem título")
    const result = await dispatchApprovalRequest({
      config: waConfig,
      phone: first.contactPhone!,
      contactName: first.contactName,
      postTitle: titleField,
      approvalUrl,
    })
    if (result.ok) {
      dispatched += links.length
      for (const l of links) dispatchedIds.push(l.id)
    } else {
      errors.push({ phone, reason: result.reason })
      await db
        .update(approvalLink)
        .set({ lastError: `meta_cloud: ${result.reason}` })
        .where(inArray(approvalLink.id, links.map((l) => l.id)))
    }
  }

  if (dispatchedIds.length > 0) {
    const now = new Date()
    await db
      .update(approvalLink)
      .set({ sentVia: "meta_cloud", sentAt: now, lastError: null })
      .where(inArray(approvalLink.id, dispatchedIds))

    // Audit trail in Notion. Uses the first Notion connection owned by
    // this client — if more than one workspace serves this client, we'd
    // need to track which connection each link came from. Acceptable v1.
    const [conn] = await db
      .select({ accessToken: notionConnection.accessToken })
      .from(notionConnection)
      .where(eq(notionConnection.clientId, id))
      .limit(1)
    if (conn?.accessToken) {
      const notion = createNotionClient(conn.accessToken)
      const when = now.toLocaleString("pt-BR")
      const dispatchedLinks = pending.filter((l) => dispatchedIds.includes(l.id))
      for (const link of dispatchedLinks) {
        const who = link.contactName ?? link.contactPhone ?? "cliente"
        await notion.postSystemComment(
          link.notionPageId,
          `🔔 Aprovação solicitada (envio manual) via WhatsApp pra ${who} · ${when}`,
        )
      }
    }
  }

  return NextResponse.json({
    dispatched,
    skipped: noPhone.length,
    errors,
    distinctRecipients: groups.size,
    totalPending: pending.length,
  })
}
