import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { approvalLink, client as clientTable, notionConnection } from "@/lib/db/schema"
import { and, eq, inArray, isNull, or } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { sendApprovalRequest, validatePhoneE164 } from "@/lib/manychat"
import { createNotionClient } from "@/lib/notion"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://posts.vitaminapublicitaria.com.br"

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
//   - Reuses the existing ManyChat Flow (same custom fields: approval_url,
//     post_title, post_url) so agencies don't need a separate template.
//     The agency's flow already supports `{{Primeiro Nome}}` natively.
//
// Returns a summary: { dispatched: count, skipped: count, errors: [...] }
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
    .select({
      name: clientTable.name,
      manychatApiKey: clientTable.manychatApiKey,
      manychatApprovalFlowNs: clientTable.manychatApprovalFlowNs,
    })
    .from(clientTable)
    .where(eq(clientTable.id, id))
  if (!row) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
  if (!row.manychatApiKey || !row.manychatApprovalFlowNs) {
    return NextResponse.json({
      error: "ManyChat não configurado pra este cliente. Cole a API key e escolha um Flow em /clients antes.",
    }, { status: 400 })
  }

  // Pending approvalLinks for this client = decision IS NULL AND not yet
  // sent (sentVia null or 'none'). Other sentVia values ('manychat',
  // 'manual', 'invalid_phone') were already handled.
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

  // Pull client's public calendar token once — used for batch links below.
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
    // For a single pending post, link straight to /approve/<token>. For
    // multiple, send the calendar URL so the client lands on the full list
    // (and can use each row's inline Approve button there).
    const approvalUrl = isBatch
      ? (calendarUrl ?? `${APP_URL}/approve/${first.token}`)
      : `${APP_URL}/approve/${first.token}`
    const titleField = isBatch
      ? `${links.length} posts aguardando sua aprovação`
      : (first.postTitle || "Post sem título")
    const result = await sendApprovalRequest({
      apiKey: row.manychatApiKey,
      flowNs: row.manychatApprovalFlowNs,
      phone: first.contactPhone!,
      customFields: {
        approval_url: approvalUrl,
        post_title: titleField,
        post_url: "",
      },
    })
    if (result.ok) {
      dispatched += links.length
      for (const l of links) dispatchedIds.push(l.id)
    } else {
      errors.push({ phone, reason: result.reason })
    }
  }

  // Mark the dispatched links as sent — prevents re-firing on the next
  // click. Done in one batched UPDATE per call.
  if (dispatchedIds.length > 0) {
    const now = new Date()
    await db
      .update(approvalLink)
      .set({ sentVia: "manychat", sentAt: now })
      .where(inArray(approvalLink.id, dispatchedIds))

    // Audit trail in Notion: leave a comment on each post that just
    // got notified, so the timeline is complete even when the dispatch
    // was triggered manually from /dashboard rather than via cron.
    // Uses the first Notion connection owned by this client — if more
    // than one workspace serves this client, we'd need to track which
    // connection each link came from. Acceptable for v1.
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
