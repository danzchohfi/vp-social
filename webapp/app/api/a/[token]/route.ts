import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { lookupApproverByToken, listApproverPendingItems } from "@/lib/approvers"
import { approvalLink, approver as approverTable, production, client as clientTable } from "@/lib/db/schema"
import { and, desc, eq, inArray } from "drizzle-orm"

/**
 * Magic Approver Portal API. NO BETTER-AUTH — the URL token IS the auth.
 *
 * The token comes from approver.magicToken (64 hex, persistent until
 * regenerated). Portal scope:
 *   - "Aguardando você": pending production-script approvalLinks where
 *     approverId === this.id AND decision IS NULL AND expiresAt > now
 *   - "Histórico": last 30 days of decided rows for the same approver
 *
 * Posts (kind='post') don't appear here — chain feature is production-only
 * in MVP.
 *
 * Per-item action (approve / changes_requested) does NOT live on this
 * route. The portal page calls the existing POST /api/approve/[item-token]
 * directly, since the per-item token is itself self-authenticating.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const approver = await lookupApproverByToken(db, token)
  if (!approver) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const pending = await listApproverPendingItems(db, approver.id)

  // History: last 30 days of decided rows for this approver. Joined with
  // production + client for display, capped at 50 rows so the page stays
  // fast even for power approvers.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const decided = await db
    .select({
      token: approvalLink.token,
      productionId: approvalLink.productionId,
      decision: approvalLink.decision,
      decidedAt: approvalLink.decidedAt,
      round: approvalLink.round,
      comment: approvalLink.comment,
    })
    .from(approvalLink)
    .where(and(
      eq(approvalLink.kind, "production_script"),
      eq(approvalLink.approverId, approver.id),
    ))
    .orderBy(desc(approvalLink.decidedAt))
    .limit(50)

  type DecidedRow = {
    token: string
    productionId: string | null
    decision: string | null
    decidedAt: Date | null
    round: number
    comment: string | null
  }
  const decidedRows = (decided as DecidedRow[]).filter(
    (r) => r.decidedAt && r.decidedAt >= since && r.decision && r.decision !== "expired"
  )

  const productionIds: string[] = Array.from(
    new Set(decidedRows.map((r) => r.productionId).filter((id): id is string => !!id))
  )
  const productions = productionIds.length
    ? await db
        .select({
          id: production.id,
          title: production.title,
          clientId: production.clientId,
        })
        .from(production)
        .where(inArray(production.id, productionIds))
    : []
  const clientIds: string[] = (productions as Array<{ clientId: string }>).map((p) => p.clientId)
  const clients = clientIds.length
    ? await db
        .select({ id: clientTable.id, name: clientTable.name })
        .from(clientTable)
        .where(inArray(clientTable.id, clientIds))
    : []

  const productionById = new Map<string, { id: string; title: string; clientId: string }>(
    (productions as Array<{ id: string; title: string; clientId: string }>).map((p) => [p.id, p])
  )
  const clientById = new Map<string, string>(
    (clients as Array<{ id: string; name: string }>).map((c) => [c.id, c.name])
  )

  const history = decidedRows.map((r) => {
    const prod = r.productionId ? productionById.get(r.productionId) : undefined
    return {
      approvalLinkToken: r.token,
      productionId: r.productionId,
      productionTitle: prod?.title ?? "Sem título",
      clientName: prod ? clientById.get(prod.clientId) ?? null : null,
      decision: r.decision,
      decidedAt: r.decidedAt,
      round: r.round,
      comment: r.comment,
      kind: "production_script" as const,
    }
  })

  // ─── Posts pending for this approver ──────────────────────────
  // Wave 3: a post-approvalLink links to an Approver via cron's
  // phone-match (lib/approvers.findApproverByPhone). Surface those
  // in the same portal so the approver has ONE URL covering both
  // productions and posts.
  const postsPending = await db
    .select({
      token: approvalLink.token,
      notionPageId: approvalLink.notionPageId,
      postTitle: approvalLink.postTitle,
      clientId: approvalLink.clientId,
      sentAt: approvalLink.sentAt,
      expiresAt: approvalLink.expiresAt,
    })
    .from(approvalLink)
    .where(and(
      eq(approvalLink.kind, "post"),
      eq(approvalLink.approverId, approver.id),
    ))

  type RawPostRow = {
    token: string
    notionPageId: string | null
    postTitle: string | null
    clientId: string | null
    sentAt: Date | null
    expiresAt: Date
  }
  const livePostsPending = (postsPending as RawPostRow[])
    .filter((p) => p.expiresAt > new Date())

  const postClientIds: string[] = Array.from(
    new Set(livePostsPending
      .map((p) => p.clientId)
      .filter((id): id is string => !!id)),
  )
  const postClients = postClientIds.length
    ? await db
        .select({ id: clientTable.id, name: clientTable.name })
        .from(clientTable)
        .where(inArray(clientTable.id, postClientIds))
    : []
  const postClientById = new Map<string, string>(
    (postClients as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  )

  // Filter only un-decided post links (the SELECT didn't include
  // decision; re-query keeping the shape consistent with the
  // production pending list).
  const postsPendingFinal = await db
    .select({
      token: approvalLink.token,
      notionPageId: approvalLink.notionPageId,
      postTitle: approvalLink.postTitle,
      clientId: approvalLink.clientId,
      sentAt: approvalLink.sentAt,
      expiresAt: approvalLink.expiresAt,
      decision: approvalLink.decision,
    })
    .from(approvalLink)
    .where(and(
      eq(approvalLink.kind, "post"),
      eq(approvalLink.approverId, approver.id),
    ))

  type PostRow = {
    token: string
    notionPageId: string | null
    postTitle: string | null
    clientId: string | null
    sentAt: Date | null
    expiresAt: Date
    decision: string | null
  }
  const postPending = (postsPendingFinal as PostRow[])
    .filter((p) => p.decision == null && p.expiresAt > new Date())
    .map((p) => ({
      approvalLinkToken: p.token,
      notionPageId: p.notionPageId,
      postTitle: p.postTitle ?? "Sem título",
      clientName: p.clientId ? postClientById.get(p.clientId) ?? null : null,
      sentAt: p.sentAt,
      expiresAt: p.expiresAt,
      kind: "post" as const,
    }))

  return NextResponse.json({
    approver: {
      id: approver.id,
      name: approver.name,
      email: approver.email,
      phone: approver.phone,
      role: approver.role,
    },
    pending,        // production-script items (existing structure)
    postPending,    // post items (new in PR AQ)
    history,
  })
}
