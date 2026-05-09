import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { instagramAccount, publishLog } from "@/lib/db/schema"
import { and, eq, max, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getActiveClientId } from "@/lib/active-client"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const clientId = await getActiveClientId(session.user.id)

  const [accounts, lastPubs] = await Promise.all([
    db.select().from(instagramAccount).where(eq(instagramAccount.clientId, clientId)),
    // Last successful publish per (platform, lower(conta)) for this client.
    // The conta-match is case-insensitive to mirror the publish dispatcher.
    db
      .select({
        platform: publishLog.platform,
        contaLower: sql<string>`lower(${publishLog.conta})`.as("conta_lower"),
        lastAt: max(publishLog.publishedAt),
      })
      .from(publishLog)
      .where(and(eq(publishLog.clientId, clientId), eq(publishLog.status, "published")))
      .groupBy(publishLog.platform, sql`lower(${publishLog.conta})`),
  ])

  const lastByKey = new Map<string, string>()
  for (const r of lastPubs) {
    if (!r.platform || !r.lastAt) continue
    lastByKey.set(`${r.platform}:${r.contaLower}`, new Date(r.lastAt).toISOString())
  }

  const enriched = accounts.map((a) => ({
    ...a,
    lastPublishedAt: lastByKey.get(`${a.platform}:${a.conta.toLowerCase()}`) ?? null,
  }))

  return NextResponse.json(enriched)
}
