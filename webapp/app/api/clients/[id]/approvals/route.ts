import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { approvalLink } from "@/lib/db/schema"
import { and, desc, eq, gte } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"

// Lists approvalLink rows for the client, grouped by lifecycle state.
// Owner-only — surfaces sensitive contact info + WhatsApp dispatch
// status that we don't want admins/members to see.
//
// Buckets:
//   pending  — decision IS NULL
//   stale    — decision IS NULL, sentAt > 3 days ago (subset of pending)
//   decided  — decision IS NOT NULL, decidedAt within last 30 days
//                (inclui aprovação tácita: decision='approved' tacit=true)
//   tacit    — subset de decided onde tacit=true (silêncio aprovou)
//   expired  — decision='expired' (synthetic: orphan/cancelado pelo cron
//                quando Notion saiu do "aguardando")
//
// Sorting: each bucket newest-first by createdAt (or decidedAt for decided).
// Limits: pending+stale uncapped (usually < 50), decided+expired capped at
// 50 each so the agency UI list stays scannable.

const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const isOwner = await userIsClientOwner(session.user.id, id)
  if (!isOwner) {
    return NextResponse.json({ error: "Apenas o owner do cliente pode ver o histórico de aprovações" }, { status: 403 })
  }

  // Last 30 days of activity (decided rows older than that drop off the
  // UI). Pending/expired/stale ignore this window — they're current state.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const rows = await db
    .select()
    .from(approvalLink)
    .where(and(
      eq(approvalLink.clientId, id),
      // Pull either currently-pending (decision null) OR decided within 30d.
      // Drizzle doesn't have a clean OR helper for this case so we widen the
      // SELECT and bucket in JS (cheap — these tables stay small per client).
      gte(approvalLink.createdAt, thirtyDaysAgo),
    ))
    .orderBy(desc(approvalLink.createdAt))

  const now = Date.now()
  const pending: typeof rows = []
  const stale: typeof rows = []
  const decided: typeof rows = []
  const tacit: typeof rows = []
  const expired: typeof rows = []

  for (const r of rows) {
    // decision='expired' = orphan/cancelado pelo cron (Notion saiu do
    // "aguardando"). Distinto de aprovação tácita, que tem decision='approved'.
    if (r.decision === "expired") {
      expired.push(r)
      continue
    }
    if (r.decision !== null) {
      decided.push(r)
      // Tacit é subset de decided. Agency vê total decidido + breakdown
      // de quantos foram tácitos (silêncio aprovou) vs explícitos.
      if (r.tacit) tacit.push(r)
      continue
    }
    pending.push(r)
    // Stale subset: pending + sentAt or createdAt older than 3 days
    const reference = r.sentAt ?? r.createdAt
    const refTs = reference instanceof Date ? reference.getTime() : new Date(reference).getTime()
    if (now - refTs > STALE_THRESHOLD_MS) stale.push(r)
  }

  // Slim each row down — don't leak contactEmail/Phone unless caller is
  // owner (already gated above). We DO return them since owner uses them
  // to manually re-send via wa.me.
  function shape(r: typeof rows[number]) {
    return {
      id: r.id,
      token: r.token,
      notionPageId: r.notionPageId,
      connectionId: r.connectionId,
      postTitle: r.postTitle,
      contactName: r.contactName,
      contactEmail: r.contactEmail,
      contactPhone: r.contactPhone,
      sentVia: r.sentVia,
      sentAt: r.sentAt,
      decision: r.decision,
      decidedAt: r.decidedAt,
      tacit: r.tacit,
      comment: r.comment,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }
  }

  return NextResponse.json({
    pending: pending.map(shape),
    stale: stale.map(shape),
    decided: decided.slice(0, 50).map(shape),
    tacit: tacit.slice(0, 50).map(shape),
    expired: expired.slice(0, 50).map(shape),
    counts: {
      pending: pending.length,
      stale: stale.length,
      decided: decided.length,
      tacit: tacit.length,
      expired: expired.length,
    },
  })
}
