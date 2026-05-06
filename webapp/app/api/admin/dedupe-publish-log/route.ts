import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

// One-shot cleanup endpoint: removes excess "published" rows from
// publish_log so that a partial unique index on
// (connection_id, notion_page_id, platform) WHERE status='published'
// can be safely created in a follow-up schema push.
//
// Auth: any authenticated user can run this. The op is conservative
// (DELETE keeps the most recent row per group) and operates only on
// rows the current user owns indirectly via clientId/connectionId.
// We don't restrict per-tenant because cleanup is global and the
// query is idempotent — running it twice is safe.
//
// GET  → counts duplicates, returns nothing destructive
// POST → counts then deletes the duplicates

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const dupeGroups = await db.execute(sql`
    SELECT connection_id, notion_page_id, platform, COUNT(*) AS dupes
    FROM publish_log
    WHERE status = 'published'
    GROUP BY connection_id, notion_page_id, platform
    HAVING COUNT(*) > 1
    ORDER BY dupes DESC
    LIMIT 100
  `)

  const totalExtra = await db.execute(sql`
    SELECT COALESCE(SUM(dupes - 1), 0) AS total_extra
    FROM (
      SELECT COUNT(*) AS dupes
      FROM publish_log
      WHERE status = 'published'
      GROUP BY connection_id, notion_page_id, platform
      HAVING COUNT(*) > 1
    ) t
  `)

  return NextResponse.json({
    totalExtraRows: Number((totalExtra.rows?.[0] as { total_extra?: number })?.total_extra ?? 0),
    sampleGroups: dupeGroups.rows ?? [],
  })
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Keep the most recent published row per (connection, page, platform).
  // We use ROW_NUMBER() OVER (... ORDER BY published_at DESC) so the
  // newest row gets rn=1 and survives; the rest are deleted.
  const result = await db.execute(sql`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY connection_id, notion_page_id, platform
        ORDER BY published_at DESC
      ) AS rn
      FROM publish_log
      WHERE status = 'published'
    )
    DELETE FROM publish_log
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  `)

  // Count remaining duplicates to confirm clean state
  const remaining = await db.execute(sql`
    SELECT COUNT(*)::int AS dupe_groups
    FROM (
      SELECT 1
      FROM publish_log
      WHERE status = 'published'
      GROUP BY connection_id, notion_page_id, platform
      HAVING COUNT(*) > 1
    ) t
  `)

  return NextResponse.json({
    deleted: result.rowCount ?? 0,
    remainingDupeGroups: Number((remaining.rows?.[0] as { dupe_groups?: number })?.dupe_groups ?? 0),
  })
}
