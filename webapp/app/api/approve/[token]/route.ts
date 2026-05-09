import { db } from "@/lib/db"
import {
  approvalLink,
  client as clientTable,
  fieldMapping,
  notionConnection,
  production,
  productionApprover,
  approver as approverTable,
  productionComment,
} from "@/lib/db/schema"
import { and, asc, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping } from "@/lib/notion"
import {
  getOrCreateClientCalendarToken,
  isApprovalDecision,
  isApprovalExpired,
  lookupApprovalLink,
} from "@/lib/approval-link"
import { advanceChain } from "@/lib/productions"
import { sendApprovalRequest } from "@/lib/manychat"
import { notifyClientDecisionAsync } from "@/lib/email-notifications"
import { generateId } from "@/lib/utils"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://posts.vitaminapublicitaria.com.br"

// Public API for the per-post approval flow. NO AUTH — the URL token IS
// the auth. The token is created by the cron sweep in trigger/publish.ts
// (kind='post') OR by /api/productions/[id]/send-approval (kind='production_script')
// and delivered via ManyChat to the contact's phone. It's single-use,
// expires in 14d, and points to one Notion page OR one production-script
// chain step.
//
//   GET  /api/approve/{token}   → returns post|script + client info for the page
//   POST /api/approve/{token}   → records decision, flips Notion status OR
//                                 advances the production chain, posts a
//                                 comment if "changes_requested"
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

  if (!client) {
    return NextResponse.json({ error: "client_or_connection_gone" }, { status: 410 })
  }

  // Generate (or reuse) the client's permanent calendar token so the
  // page can redirect to /c/{token} after a decision.
  const calendarToken = await getOrCreateClientCalendarToken(client.id)

  // ─── Production-script branch (kind='production_script') ───────────
  // No Notion call — script body lives in DB. Chain context (this is step
  // 2 of 3, João already approved) drives the sidebar banner on the page.
  if (row.kind === "production_script" && row.productionId) {
    const [prod] = await db
      .select()
      .from(production)
      .where(eq(production.id, row.productionId))

    const chainRows = await db
      .select({ stepOrder: productionApprover.stepOrder, approverId: productionApprover.approverId })
      .from(productionApprover)
      .where(eq(productionApprover.productionId, row.productionId))
      .orderBy(asc(productionApprover.stepOrder))

    const myStep = chainRows.find((s) => s.approverId === row.approverId)?.stepOrder ?? 1

    // Approvers who decided in THIS round (so the page can render
    // "João Silva já aprovou ✓" hints).
    const decidedThisRound = await db
      .select({
        approverId: approvalLink.approverId,
        decidedAt: approvalLink.decidedAt,
        decision: approvalLink.decision,
      })
      .from(approvalLink)
      .where(and(
        eq(approvalLink.kind, "production_script"),
        eq(approvalLink.productionId, row.productionId),
        eq(approvalLink.round, row.round),
      ))

    const allApproverIds = chainRows.map((c) => c.approverId)
    const approvers = allApproverIds.length > 0
      ? await db
          .select({ id: approverTable.id, name: approverTable.name })
          .from(approverTable)
          .where(inArray(approverTable.id, allApproverIds))
      : []
    const nameById = new Map(approvers.map((a) => [a.id, a.name]))

    const previousApprovers = decidedThisRound
      .filter((d) => d.decision === "approved" && d.approverId && d.approverId !== row.approverId)
      .map((d) => ({
        name: d.approverId ? nameById.get(d.approverId) ?? "" : "",
        approvedAt: d.decidedAt,
      }))
      .filter((d) => d.name)

    return NextResponse.json({
      state: result.kind,
      decision: row.decision,
      decidedAt: row.decidedAt,
      sentAt: row.sentAt,
      expiresAt: row.expiresAt,
      contactName: row.contactName,
      pendingSiblings: 0,
      kind: "production_script",
      client: {
        name: client.name,
        logoUrl: client.logoUrl,
        calendarUrl: `/c/${calendarToken}`,
      },
      production: prod
        ? {
            id: prod.id,
            title: prod.title,
            type: prod.type,
            specialistName: prod.specialistName,
            scriptJson: prod.scriptJson,
          }
        : null,
      chainContext: {
        stepOrder: myStep,
        totalSteps: chainRows.length,
        round: row.round,
        previousApprovers,
      },
    })
  }

  // ─── Legacy post-approval branch (kind='post') ──────────────────
  const [conn] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.id, row.connectionId))
  if (!conn) return NextResponse.json({ error: "client_or_connection_gone" }, { status: 410 })

  const [mappingRow] = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, conn.id))
  const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING

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

  // Count other pending approvals for this same client — drives the
  // sibling banner ("Você tem 2 outros posts pendentes"). Excludes the
  // current token + any decided/expired rows. Cheap query (per-client
  // approval_link table stays small) and uses approval_link_client_idx.
  const now = new Date()
  const siblings = await db
    .select({ id: approvalLink.id })
    .from(approvalLink)
    .where(and(
      eq(approvalLink.clientId, client.id),
      isNull(approvalLink.decision),
      gt(approvalLink.expiresAt, now),
      ne(approvalLink.token, token),
    ))

  return NextResponse.json({
    state: result.kind,
    decision: row.decision,
    decidedAt: row.decidedAt,
    sentAt: row.sentAt,
    expiresAt: row.expiresAt,
    contactName: row.contactName,
    pendingSiblings: siblings.length,
    kind: "post",
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

  // Atomic decide: claim the row first via a conditional UPDATE so two
  // concurrent POSTs (rare but possible if the client double-taps) only
  // let one through. Drizzle returns affected rows.
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
    const [latest] = await db
      .select({ decision: approvalLink.decision })
      .from(approvalLink)
      .where(eq(approvalLink.token, token))
    return NextResponse.json(
      { error: "already_decided", decision: latest?.decision ?? null },
      { status: 409 }
    )
  }

  const calendarToken = await getOrCreateClientCalendarToken(row.clientId)

  // ─── Production-script branch ───────────────────────────────
  // No Notion side effects. On approval, advance the chain (or finish
  // it) — chain advance dispatches ManyChat to the next approver. On
  // changes_requested, mirror the comment into productionComment and
  // flip the production back to revision_requested.
  if (row.kind === "production_script" && row.productionId) {
    if (body.decision === "approved") {
      // advanceChain looks at all the round's approved rows (now
      // including ours) and figures out who's next.
      try {
        const next = await advanceChain(db, row.productionId, row.round)
        if (next.kind === "next") {
          // Dispatch ManyChat to the next approver.
          const [client] = await db
            .select({
              manychatApiKey: clientTable.manychatApiKey,
              manychatFlowNs: clientTable.manychatApprovalFlowNs,
            })
            .from(clientTable)
            .where(eq(clientTable.id, row.clientId))
          let nextSentVia: "manychat" | "none" = "none"
          if (client?.manychatApiKey && client?.manychatFlowNs && next.approver.phone) {
            const sendResult = await sendApprovalRequest({
              apiKey: client.manychatApiKey,
              flowNs: client.manychatFlowNs,
              phone: next.approver.phone,
              customFields: {
                approval_url: `${APP_URL}/approve/${next.approvalLinkRow.token}`,
                post_title: next.approvalLinkRow.postTitle,
                contact_name: next.approver.name,
                post_url: "",
              },
            })
            if (sendResult.ok) nextSentVia = "manychat"
          }
          await db
            .update(approvalLink)
            .set({ sentVia: nextSentVia, sentAt: nextSentVia === "none" ? null : new Date() })
            .where(eq(approvalLink.id, next.approvalLinkRow.id))
        } else {
          // Chain complete (or no_chain): flip production to approved.
          await db
            .update(production)
            .set({ status: "approved", updatedAt: new Date() })
            .where(eq(production.id, row.productionId))
        }
      } catch (e) {
        console.error(`[approve POST] advanceChain failed for production ${row.productionId}:`, e)
      }
    } else {
      // changes_requested: mirror comment into productionComment thread.
      // Also flip production status so agency sees the revision request
      // in the /productions list.
      try {
        if (comment) {
          await db.insert(productionComment).values({
            id: generateId(),
            productionId: row.productionId,
            authorUserId: null,
            authorName: row.contactName ?? "Cliente",
            body: comment,
          })
        }
        await db
          .update(production)
          .set({ status: "revision_requested", updatedAt: new Date() })
          .where(eq(production.id, row.productionId))
      } catch (e) {
        console.error(`[approve POST] production-script revision side-effects failed:`, e)
      }
    }

    return NextResponse.json({
      ok: true,
      decision: body.decision,
      kind: "production_script",
      calendarUrl: `/c/${calendarToken}`,
    })
  }

  // ─── Legacy post-approval branch ────────────────────────────
  const [conn] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.id, row.connectionId))
  if (!conn) return NextResponse.json({ error: "connection_gone" }, { status: 410 })

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
    console.error(`[approve POST] Notion side-effect failed for token ${token}:`, e)
  }

  // Notify the agency owner via email so they don't have to refresh
  // /scheduled to learn about the decision. Fire-and-forget so a Resend
  // outage doesn't make the public approval flow look broken.
  try {
    const [ownerClient] = await db
      .select({ name: clientTable.name, userId: clientTable.userId })
      .from(clientTable)
      .where(eq(clientTable.id, row.clientId))
    if (ownerClient?.userId) {
      notifyClientDecisionAsync(ownerClient.userId, ownerClient.name ?? null, {
        postTitle: row.postTitle,
        contactName: row.contactName,
        decision: body.decision,
        comment: comment || null,
        approvalUrl: `${APP_URL}/approve/${row.token}`,
        notionPageId: row.notionPageId,
      })
    }
  } catch (e) {
    console.warn(`[approve POST] decision-email lookup failed for token ${token}:`, e)
  }

  return NextResponse.json({
    ok: true,
    decision: body.decision,
    kind: "post",
    calendarUrl: `/c/${calendarToken}`,
  })
}
