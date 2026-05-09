import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { publishLog } from "@/lib/db/schema"
import { and, eq, gte, isNotNull, lt } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { tasks } from "@trigger.dev/sdk/v3"
import type { syncPostAnalytics } from "@/trigger/analytics"
import { userHasClientAccess } from "@/lib/active-client"

// Manual on-demand analytics sync — fires the per-post sync task for
// every published IG row in the requested window without waiting for
// the 6h cron. Used from the report page when the agency wants fresh
// numbers right now (e.g. preparing a deck).
//
// Body: { month?: "YYYY-MM" } — defaults to current month.
//
// Returns: { triggered: <count> } as soon as Trigger.dev accepts the
// batch. The actual writes happen async on the worker; clients should
// reload after a minute or two.

function parseMonth(input: string | null): { from: Date; to: Date } {
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth()
  const m = (input ?? "").match(/^(\d{4})-(\d{2})$/)
  if (m) {
    year = parseInt(m[1], 10)
    month = parseInt(m[2], 10) - 1
  }
  return {
    from: new Date(year, month, 1, 0, 0, 0),
    to: new Date(year, month + 1, 1, 0, 0, 0),
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const ok = await userHasClientAccess(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { month?: string } | null
  const range = parseMonth(body?.month ?? null)

  const logs = await db
    .select({ id: publishLog.id })
    .from(publishLog)
    .where(and(
      eq(publishLog.clientId, id),
      eq(publishLog.status, "published"),
      isNotNull(publishLog.instagramPostId),
      gte(publishLog.publishedAt, range.from),
      lt(publishLog.publishedAt, range.to),
    ))

  if (!logs.length) {
    return NextResponse.json({ triggered: 0 })
  }

  await tasks.batchTrigger<typeof syncPostAnalytics>(
    "sync-post-analytics",
    logs.map((log) => ({ payload: { logId: log.id } })),
  )

  return NextResponse.json({ triggered: logs.length })
}
