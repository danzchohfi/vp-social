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
    }
  })

  return NextResponse.json({
    approver: {
      id: approver.id,
      name: approver.name,
      email: approver.email,
      phone: approver.phone,
      role: approver.role,
    },
    pending,
    history,
  })
}
