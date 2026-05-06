import { db } from "@/lib/db"
import { approvalLink, client as clientTable, fieldMapping, notionConnection } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping } from "@/lib/notion"
import {
  getOrCreateClientCalendarToken,
  isApprovalDecision,
  isApprovalExpired,
  lookupApprovalLink,
} from "@/lib/approval-link"

// Public API for the per-post approval flow. NO AUTH — the URL token IS
// the auth. The token is created by the cron sweep in trigger/publish.ts
// and delivered via ManyChat to the client's phone. It's single-use,
// expires in 14d, and points to one Notion page.
//
//   GET  /api/approve/{token}   → returns post + client info for the page
//   POST /api/approve/{token}   → records decision, flips Notion status,
//                                 posts a comment if "changes_requested"
//
// Once a decision is recorded, the same token can't be re-decided. The
// page handles "already decided" + "expired" with their own UX.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const result = await lookupApprovalLink(token)

  if (result.kind === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const row = result.row

  // Pull client + mapping + connection in one shot (we need access token
  // for Notion, plus client name and calendar token for the redirect).
  const [client] = await db
    .select({
      id: clientTable.id,
      name: clientTable.name,
      logoUrl: clientTable.logoUrl,
      publicCalendarToken: clientTable.publicCalendarToken,
    })
    .from(clientTable)
    .where(eq(clientTable.id, row.clientId))

  const [conn] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.id, row.connectionId))

  if (!conn || !client) {
    return NextResponse.json({ error: "client_or_connection_gone" }, { status: 410 })
  }

  const [mappingRow] = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, conn.id))
  const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING

  // Generate (or reuse) the client's permanent calendar token so the
  // page can redirect to /c/{token} after a decision.
  const calendarToken = await getOrCreateClientCalendarToken(client.id)

  // Lazily fetch the post details from Notion. Read-only. If the Notion
  // page was deleted, we still want to render an "expired" state instead
  // of a hard 500.
  const notion = createNotionClient(conn.accessToken)
  let post: Awaited<ReturnType<ReturnType<typeof createNotionClient>["getPostById"]>> = null
  try {
    post = await notion.getPostById(row.notionPageId, mapping)
  } catch {
    post = null
  }

  return NextResponse.json({
    state: result.kind, // "ok" | "decided" | "expired"
    decision: row.decision,
    decidedAt: row.decidedAt,
    contactName: row.contactName,
    client: {
      name: client.name,
      logoUrl: client.logoUrl,
      calendarUrl: `/c/${calendarToken}`,
    },
    post: post
      ? {
          pageId: post.pageId,
          title: post.title,
          conta: post.conta,
          fullCaption: post.fullCaption,
          feedImageUrls: post.feedImageUrls,
          verticalUrls: post.verticalUrls,
          horizontalUrls: post.horizontalUrls,
          thumbnailUrl: post.thumbnailUrl,
          publishTargets: post.publishTargets,
          scheduledDate: post.scheduledDate,
          notionUrl: post.notionUrl,
        }
      : null,
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  if (!isApprovalDecision(body.decision)) {
    return NextResponse.json({ error: "invalid_decision" }, { status: 400 })
  }
  const comment = typeof body.comment === "string" ? body.comment.trim() : ""
  if (body.decision === "changes_requested" && !comment) {
    return NextResponse.json({ error: "comment_required_for_changes" }, { status: 400 })
  }

  // Look up + validate. We re-lookup inside the POST (instead of trusting
  // a passed state) to prevent races: client could have an old GET cached
  // and try to decide an already-decided link. Atomically re-check here.
  const [row] = await db
    .select()
    .from(approvalLink)
    .where(eq(approvalLink.token, token))

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (row.decision !== null) {
    return NextResponse.json({ error: "already_decided", decision: row.decision }, { status: 409 })
  }
  if (isApprovalExpired(row.expiresAt)) {
    return NextResponse.json({ error: "expired" }, { status: 410 })
  }

  // Load mapping + connection for the Notion calls.
  const [conn] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.id, row.connectionId))
  if (!conn) {
    return NextResponse.json({ error: "connection_gone" }, { status: 410 })
  }
  const [mappingRow] = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, conn.id))
  const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING

  if (body.decision === "changes_requested" && !mapping.revisionRequestedValue) {
    return NextResponse.json(
      { error: "revisionRequestedValue not configured", configError: true },
      { status: 500 }
    )
  }

  const notion = createNotionClient(conn.accessToken)

  // Atomic decide: claim the row first via a conditional UPDATE so two
  // concurrent POSTs (rare but possible if the client double-taps) only
  // let one through. Drizzle returns affected rows in `result.rowCount`.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? null

  const claim = await db
    .update(approvalLink)
    .set({
      decision: body.decision,
      decidedAt: new Date(),
      decidedFromIp: ip,
      comment: comment || null,
    })
    .where(and(
      eq(approvalLink.token, token),
      isNull(approvalLink.decision),
    ))
    .returning({ id: approvalLink.id })

  if (claim.length === 0) {
    // Another concurrent request beat us to it. Re-read to surface the
    // already-decided state to the second client.
    const [latest] = await db
      .select({ decision: approvalLink.decision })
      .from(approvalLink)
      .where(eq(approvalLink.token, token))
    return NextResponse.json(
      { error: "already_decided", decision: latest?.decision ?? null },
      { status: 409 }
    )
  }

  // Side effects on Notion. If they fail we DON'T roll back the DB
  // claim — the decision stands, and the agency sees the issue when
  // reviewing /scheduled. Better than a partial state where DB says
  // "approved" but Notion still shows "Aguardando".
  try {
    if (body.decision === "approved") {
      await notion.markReady(row.notionPageId, mapping)
    } else {
      await notion.markRevision(row.notionPageId, mapping)
      if (comment) {
        await notion.addClientComment(row.notionPageId, comment, row.contactName ?? null)
      }
    }
  } catch (e) {
    // Log + return success. Decision is already saved. Agency manual
    // intervention can reconcile if needed.
    console.error(`[approve POST] Notion side-effect failed for token ${token}:`, e)
  }

  // Generate calendar token so the success page can redirect to /c/{token}.
  const calendarToken = await getOrCreateClientCalendarToken(row.clientId)

  return NextResponse.json({
    ok: true,
    decision: body.decision,
    calendarUrl: `/c/${calendarToken}`,
  })
}
