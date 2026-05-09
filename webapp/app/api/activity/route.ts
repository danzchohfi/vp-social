import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { approvalLink, publishLog } from "@/lib/db/schema"
import { and, desc, gte, inArray, isNotNull } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { listAccessibleClients } from "@/lib/active-client"

// Cross-client activity feed — single chronological stream of events
// the agency cares about: publishes (success + failure), approvals
// (created + decided). Used by /activity page to give the agency a
// "what happened while I was away" timeline without manually checking
// each /scheduled and /clients page.
//
// Scope: ALL accessible clients (not just current active). Returns
// events from the last 14 days, capped at `limit` (default 50).
//
// We don't materialize an `events` table — derive on read from existing
// publishLog + approvalLink rows. Avoids backfill + dual-write costs;
// the queries are fast at agency scale (typical: <1000 rows/14d).

export type ActivityEvent =
  | {
      kind: "published" | "failed"
      id: string
      timestamp: string
      clientId: string | null
      clientName: string | null
      postTitle: string
      conta: string | null
      platform: string | null
      error: string | null
      permalink: string | null
    }
  | {
      kind: "approval_decided"
      id: string
      timestamp: string
      clientId: string | null
      clientName: string | null
      postTitle: string
      contactName: string | null
      decision: "approved" | "changes_requested" | "expired" | string
      comment: string | null
      token: string
    }

const ALLOWED_DAYS = new Set([7, 14, 30])
const DEFAULT_DAYS = 14

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const limitParam = parseInt(url.searchParams.get("limit") ?? "50", 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 200 ? limitParam : 50
  const daysParam = parseInt(url.searchParams.get("days") ?? `${DEFAULT_DAYS}`, 10)
  const days = ALLOWED_DAYS.has(daysParam) ? daysParam : DEFAULT_DAYS
  // `kinds` accepts comma-separated values: publishes,approvals. Empty/missing
  // = both. Anything else falls back to both — easier than 400'ing the page.
  const kindsParam = (url.searchParams.get("kinds") ?? "").trim()
  const wantPublishes = kindsParam === "" || kindsParam.includes("publishes")
  const wantApprovals = kindsParam === "" || kindsParam.includes("approvals")

  const accessible = await listAccessibleClients(session.user.id)
  const clientIds = accessible.map((c) => c.id)
  if (clientIds.length === 0) {
    return NextResponse.json({ events: [], days, kinds: { publishes: wantPublishes, approvals: wantApprovals } })
  }
  const clientNameById = new Map(accessible.map((c) => [c.id, c.name]))

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  type LogRow = typeof publishLog.$inferSelect
  type LinkRow = typeof approvalLink.$inferSelect
  const [logs, decided] = await Promise.all([
    wantPublishes
      ? db
          .select()
          .from(publishLog)
          .where(and(
            inArray(publishLog.clientId, clientIds),
            gte(publishLog.publishedAt, since),
          ))
          .orderBy(desc(publishLog.publishedAt))
          .limit(limit * 2) // overfetch so we can interleave with approvals
      : Promise.resolve([] as LogRow[]),
    wantApprovals
      ? db
          .select()
          .from(approvalLink)
          .where(and(
            inArray(approvalLink.clientId, clientIds),
            gte(approvalLink.decidedAt, since),
            isNotNull(approvalLink.decidedAt),
          ))
          .orderBy(desc(approvalLink.decidedAt))
          .limit(limit * 2)
      : Promise.resolve([] as LinkRow[]),
  ])

  const events: ActivityEvent[] = []

  for (const log of logs) {
    if (log.status !== "published" && log.status !== "failed") continue
    events.push({
      kind: log.status,
      id: `log:${log.id}`,
      timestamp: log.publishedAt.toISOString(),
      clientId: log.clientId,
      clientName: log.clientId ? clientNameById.get(log.clientId) ?? null : null,
      postTitle: log.postTitle,
      conta: log.conta,
      platform: log.platform,
      error: log.error,
      permalink: log.platformPostUrl,
    })
  }

  for (const link of decided) {
    if (!link.decidedAt) continue
    const decision = link.decision
    if (decision !== "approved" && decision !== "changes_requested" && decision !== "expired") continue
    events.push({
      kind: "approval_decided",
      id: `link:${link.id}`,
      timestamp: link.decidedAt.toISOString(),
      clientId: link.clientId,
      clientName: link.clientId ? clientNameById.get(link.clientId) ?? null : null,
      postTitle: link.postTitle,
      contactName: link.contactName,
      decision,
      comment: link.comment,
      token: link.token,
    })
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return NextResponse.json({
    events: events.slice(0, limit),
    days,
    kinds: { publishes: wantPublishes, approvals: wantApprovals },
  })
}
