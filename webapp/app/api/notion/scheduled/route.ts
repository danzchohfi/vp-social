import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection, fieldMapping, instagramAccount, publishLog } from "@/lib/db/schema"
import { eq, and, gte } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { getActiveClientId } from "@/lib/active-client"

type TargetCheck = { raw: string; platform: string; tipo: string; configured: boolean; pageName?: string | null }

const PAST_WINDOW_DAYS = 90

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const clientId = await getActiveClientId(session.user.id)

  const [connections, accounts] = await Promise.all([
    db.select().from(notionConnection).where(eq(notionConnection.clientId, clientId)),
    db.select().from(instagramAccount).where(eq(instagramAccount.clientId, clientId)),
  ])

  const configured = connections.filter((c) => c.databaseId)

  const accountMap = new Map(
    accounts.filter((a) => a.active).map((a) => [`${a.platform.toLowerCase()}:${a.conta.toLowerCase()}`, a])
  )
  const clientContas = new Set(accounts.filter((a) => a.active).map((a) => a.conta.toLowerCase()))

  // ─── Upcoming (Notion) ────────────────────────────────────────────────────
  let upcoming: any[] = []
  if (configured.length) {
    const allPosts = await Promise.allSettled(
      configured.map(async (connection) => {
        const [mappingRow] = await db
          .select()
          .from(fieldMapping)
          .where(eq(fieldMapping.connectionId, connection.id))

        const mapping = mappingRow ?? DEFAULT_MAPPING
        const notion = createNotionClient(connection.accessToken)
        const posts = await notion.getScheduledPosts(connection.databaseId!, mapping)
        return posts.map((p) => {
          const targetChecks: TargetCheck[] = p.publishTargets.map((t) => {
            const key = `${t.platform}:${p.conta?.toLowerCase() ?? ""}`
            const account = accountMap.get(key)
            return {
              raw: t.raw,
              platform: t.platform,
              tipo: t.tipo,
              configured: !!account,
              pageName: account?.pageName ?? null,
            }
          })
          const contaKey = p.conta?.toLowerCase() ?? ""
          const contaConnected = contaKey ? accounts.some((a) => a.active && a.conta.toLowerCase() === contaKey) : false
          const belongsToClient = !!p.conta && clientContas.has(p.conta.toLowerCase())
          return {
            kind: "upcoming",
            ...p,
            workspaceName: connection.workspaceName,
            connectionId: connection.id,
            targetChecks,
            belongsToClient,
            contaConnected,
          }
        })
      })
    )

    upcoming = allPosts
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
      .flatMap((r) => r.value)
      .sort((a, b) => {
        if (!a.scheduledDate) return 1
        if (!b.scheduledDate) return -1
        return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
      })
  }

  // ─── Past (publishLog) ─────────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const logs = await db
    .select()
    .from(publishLog)
    .where(
      and(
        eq(publishLog.userId, session.user.id),
        gte(publishLog.publishedAt, cutoff),
        ...(clientId ? [eq(publishLog.clientId, clientId)] : [])
      )
    )

  // Group log rows by notionPageId so one Notion post = one past entry
  // even when it published to several platforms.
  const grouped = new Map<string, any>()
  for (const log of logs) {
    const key = log.notionPageId
    let entry = grouped.get(key)
    if (!entry) {
      entry = {
        kind: "past",
        pageId: log.notionPageId,
        title: log.postTitle,
        conta: log.conta,
        date: log.publishedAt,
        connectionId: log.connectionId,
        belongsToClient: true,
        platforms: [] as any[],
      }
      grouped.set(key, entry)
    }
    entry.platforms.push({
      raw: log.platform ?? "—",
      status: log.status,
      error: log.error,
      postId: log.platformPostId ?? log.instagramPostId,
      logId: log.id,
    })
    // Use the earliest publishedAt for the group's date
    if (new Date(log.publishedAt) < new Date(entry.date)) entry.date = log.publishedAt
  }

  const past = Array.from(grouped.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  return NextResponse.json({
    upcoming,
    past,
    // Backward-compat: existing /scheduled callers that read `posts` keep working.
    posts: upcoming,
    configured: configured.length > 0,
  })
}
