import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  approvalLink,
  client as clientTable,
  publishLog,
} from "@/lib/db/schema"
import { and, desc, eq, gte, lt } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userHasClientAccess } from "@/lib/active-client"

// Per-client monthly report — aggregates publish + approval data into
// a printable summary the agency can share with the client. Owner-or-
// member auth via userHasClientAccess.
//
// Query: /api/clients/[id]/report?month=YYYY-MM
//   Defaults to current month if omitted.
//
// Returns:
//   { client, month, range, publish, approval, topPosts }

type MonthRange = { from: Date; to: Date; label: string }

function parseMonth(input: string | null): MonthRange {
  // Accept "YYYY-MM" or empty (= current month).
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() // 0-indexed
  const m = (input ?? "").match(/^(\d{4})-(\d{2})$/)
  if (m) {
    year = parseInt(m[1], 10)
    month = parseInt(m[2], 10) - 1
  }
  const from = new Date(year, month, 1, 0, 0, 0)
  const to = new Date(year, month + 1, 1, 0, 0, 0)
  const label = from.toLocaleString("pt-BR", { month: "long", year: "numeric" })
  return { from, to, label }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const ok = await userHasClientAccess(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const url = new URL(req.url)
  const range = parseMonth(url.searchParams.get("month"))

  const [c] = await db.select().from(clientTable).where(eq(clientTable.id, id))
  if (!c) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

  // Pull all publish_log rows for the client in this month — single query,
  // bucket in JS. Counts are small enough (typical: 50–500/month per client).
  const logs = await db
    .select()
    .from(publishLog)
    .where(and(
      eq(publishLog.clientId, id),
      gte(publishLog.publishedAt, range.from),
      lt(publishLog.publishedAt, range.to),
    ))
    .orderBy(desc(publishLog.publishedAt))

  // Bucket by status + platform for the headline numbers.
  let totalPublished = 0
  let totalFailed = 0
  let totalSkipped = 0
  const byPlatform = new Map<string, { published: number; failed: number; skipped: number }>()
  // Aggregate engagement only across PUBLISHED rows that have analytics
  // synced. Posts without analytics_lastSyncedAt are excluded from the
  // engagement totals so partial-sync states don't pollute the numbers.
  let totalLikes = 0
  let totalComments = 0
  let totalReach = 0
  let totalSaves = 0
  let totalImpressions = 0
  let analyticsCovered = 0
  type TopCandidate = {
    pageId: string
    title: string
    conta: string
    platform: string
    publishedAt: Date
    likes: number
    comments: number
    reach: number
    impressions: number
    permalink: string | null
  }
  const topCandidates: TopCandidate[] = []

  for (const log of logs) {
    const platform = log.platform || "—"
    let bucket = byPlatform.get(platform)
    if (!bucket) {
      bucket = { published: 0, failed: 0, skipped: 0 }
      byPlatform.set(platform, bucket)
    }
    if (log.status === "published") {
      totalPublished++
      bucket.published++
      if (log.metricsLastSyncedAt) {
        const likes = log.metricsLikes ?? 0
        const comments = log.metricsComments ?? 0
        const reach = log.metricsReach ?? 0
        const saves = log.metricsSaves ?? 0
        const impressions = log.metricsImpressions ?? 0
        totalLikes += likes
        totalComments += comments
        totalReach += reach
        totalSaves += saves
        totalImpressions += impressions
        analyticsCovered++
        topCandidates.push({
          pageId: log.notionPageId,
          title: log.postTitle,
          conta: log.conta,
          platform,
          publishedAt: log.publishedAt,
          likes,
          comments,
          reach,
          impressions,
          permalink: log.platformPostUrl,
        })
      }
    } else if (log.status === "failed") {
      totalFailed++
      bucket.failed++
    } else {
      totalSkipped++
      bucket.skipped++
    }
  }

  // Top 3 by reach (engagement proxy that's available across IG and others).
  const topPosts = topCandidates
    .sort((a, b) => (b.reach + b.likes) - (a.reach + a.likes))
    .slice(0, 3)

  // Approval stats — links created in this month, regardless of decision date.
  const links = await db
    .select()
    .from(approvalLink)
    .where(and(
      eq(approvalLink.clientId, id),
      gte(approvalLink.createdAt, range.from),
      lt(approvalLink.createdAt, range.to),
    ))

  let approvalsTotal = 0
  let approvalsApproved = 0
  let approvalsRevised = 0
  let approvalsExpired = 0
  let approvalsPending = 0
  let approvalDecisionMsTotal = 0
  let approvalDecisionMsCount = 0
  for (const link of links) {
    approvalsTotal++
    if (link.decision === "approved") {
      approvalsApproved++
      if (link.decidedAt && link.sentAt) {
        approvalDecisionMsTotal += new Date(link.decidedAt).getTime() - new Date(link.sentAt).getTime()
        approvalDecisionMsCount++
      }
    } else if (link.decision === "changes_requested") {
      approvalsRevised++
    } else if (link.decision === "expired") {
      approvalsExpired++
    } else if (link.decision === null) {
      approvalsPending++
    }
  }
  const approvalAvgHours = approvalDecisionMsCount > 0
    ? Math.round(approvalDecisionMsTotal / approvalDecisionMsCount / (1000 * 60 * 60) * 10) / 10
    : null

  return NextResponse.json({
    client: {
      id: c.id,
      name: c.name,
      logoUrl: c.logoUrl,
    },
    month: {
      label: range.label,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
    publish: {
      totalPublished,
      totalFailed,
      totalSkipped,
      // Sorted: highest publish count first
      byPlatform: Array.from(byPlatform.entries())
        .map(([platform, counts]) => ({ platform, ...counts }))
        .sort((a, b) => b.published - a.published),
    },
    engagement: {
      totalLikes,
      totalComments,
      totalReach,
      totalSaves,
      totalImpressions,
      // % of published posts that have synced analytics (transparency
      // for the agency: if low, they should run a manual sync).
      coveragePercent: totalPublished > 0
        ? Math.round((analyticsCovered / totalPublished) * 100)
        : 0,
      analyticsCovered,
    },
    approval: {
      total: approvalsTotal,
      approved: approvalsApproved,
      revisionRequested: approvalsRevised,
      expired: approvalsExpired,
      pending: approvalsPending,
      // First-try-approved rate: of all DECIDED links, how many were
      // approved (vs went into revision). Useful KPI for content quality.
      firstTryRate: approvalsApproved + approvalsRevised > 0
        ? Math.round((approvalsApproved / (approvalsApproved + approvalsRevised)) * 100)
        : null,
      avgDecisionHours: approvalAvgHours,
    },
    topPosts,
  })
}
