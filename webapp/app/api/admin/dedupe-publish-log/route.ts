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
// Auth: any authenticated user — MAS ESCOPADO pelo userId. Antes era
// global (qualquer user logado podia disparar dedupe de TODA a tabela,
// inclusive rows de outros tenants). Agora cada user vê e limpa apenas
// publish_log rows que pertencem a ele (via userId). Op idempotente,
// rodar 2x é seguro.
//
// GET  → counts duplicates DESTE user, returns nothing destructive
// POST → counts then deletes the duplicates DESTE user

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const uid = session.user.id

  const dupeGroups = await db.execute(sql`
    SELECT connection_id, notion_page_id, platform, COUNT(*) AS dupes
    FROM publish_log
    WHERE status = 'published' AND user_id = ${uid}
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
      WHERE status = 'published' AND user_id = ${uid}
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
  const uid = session.user.id

  // Keep the most recent published row per (connection, page, platform).
  // Restringido a user_id pra não vazar entre tenants.
  const result = await db.execute(sql`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY connection_id, notion_page_id, platform
        ORDER BY published_at DESC
      ) AS rn
      FROM publish_log
      WHERE status = 'published' AND user_id = ${uid}
    )
    DELETE FROM publish_log
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  `)

  const remaining = await db.execute(sql`
    SELECT COUNT(*)::int AS dupe_groups
    FROM (
      SELECT 1
      FROM publish_log
      WHERE status = 'published' AND user_id = ${uid}
      GROUP BY connection_id, notion_page_id, platform
      HAVING COUNT(*) > 1
    ) t
  `)

  return NextResponse.json({
    deleted: result.rowCount ?? 0,
    remainingDupeGroups: Number((remaining.rows?.[0] as { dupe_groups?: number })?.dupe_groups ?? 0),
  })
}
