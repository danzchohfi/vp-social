import { db } from "@/lib/db"
import { client as clientTable, publishLog } from "@/lib/db/schema"
import { and, desc, eq, gte } from "drizzle-orm"
import { NextResponse } from "next/server"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { listAccessibleClients } from "@/lib/active-client"

// GET /api/c/[token]/metrics — agregação de métricas dos posts publicados
// do cliente nos últimos 90 dias. Dados vêm do publishLog (cron analytics
// já sincroniza like/comment/reach/saves/impressions via IG Graph).
//
// Retorna:
//   summary: totais e médias agregadas
//   topPosts: 5 posts com mais reach
//   recent: últimos 10 posts com métricas pra timeline

const WINDOW_DAYS = 90

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const ip = clientIp(req)
  if (checkRateLimit(`metrics:${ip}`, { max: 30, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  const [client] = await db
    .select()
    .from(clientTable)
    .where(eq(clientTable.publicCalendarToken, token))
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Aceita posts deste client + posts de siblings cuja conta pertence
  // a este client. Mesma lógica que o calendar GET — mantém consistência
  // de visibilidade.
  const accessibleSiblings = await listAccessibleClients(client.userId)
  const ownClaim = accessibleSiblings.find((s) => s.id === client.id)
  const ownContas = new Set<string>(
    (ownClaim?.notionContaValues ?? []).map((v) => v.trim().toLowerCase()),
  )

  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const logs = await db
    .select({
      id: publishLog.id,
      notionPageId: publishLog.notionPageId,
      postTitle: publishLog.postTitle,
      conta: publishLog.conta,
      platform: publishLog.platform,
      platformPostUrl: publishLog.platformPostUrl,
      status: publishLog.status,
      publishedAt: publishLog.publishedAt,
      metricsLikes: publishLog.metricsLikes,
      metricsComments: publishLog.metricsComments,
      metricsReach: publishLog.metricsReach,
      metricsSaves: publishLog.metricsSaves,
      metricsImpressions: publishLog.metricsImpressions,
      metricsLastSyncedAt: publishLog.metricsLastSyncedAt,
    })
    .from(publishLog)
    .where(and(
      eq(publishLog.clientId, client.id),
      eq(publishLog.status, "success"),
      gte(publishLog.publishedAt, cutoff),
    ))
    .orderBy(desc(publishLog.publishedAt))

  const filtered = logs.filter((l) => {
    const k = l.conta.trim().toLowerCase()
    return ownContas.size === 0 || ownContas.has(k)
  })

  const summary = {
    posts: filtered.length,
    likes: filtered.reduce((s, l) => s + (l.metricsLikes ?? 0), 0),
    comments: filtered.reduce((s, l) => s + (l.metricsComments ?? 0), 0),
    reach: filtered.reduce((s, l) => s + (l.metricsReach ?? 0), 0),
    saves: filtered.reduce((s, l) => s + (l.metricsSaves ?? 0), 0),
    impressions: filtered.reduce((s, l) => s + (l.metricsImpressions ?? 0), 0),
    lastSyncedAt: filtered
      .map((l) => l.metricsLastSyncedAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
  }

  const topPosts = [...filtered]
    .filter((l) => (l.metricsReach ?? 0) > 0)
    .sort((a, b) => (b.metricsReach ?? 0) - (a.metricsReach ?? 0))
    .slice(0, 5)
    .map((l) => ({
      pageId: l.notionPageId,
      title: l.postTitle,
      platform: l.platform,
      postUrl: l.platformPostUrl,
      publishedAt: l.publishedAt,
      likes: l.metricsLikes ?? 0,
      comments: l.metricsComments ?? 0,
      reach: l.metricsReach ?? 0,
      saves: l.metricsSaves ?? 0,
    }))

  const recent = filtered.slice(0, 10).map((l) => ({
    pageId: l.notionPageId,
    title: l.postTitle,
    platform: l.platform,
    publishedAt: l.publishedAt,
    likes: l.metricsLikes ?? 0,
    comments: l.metricsComments ?? 0,
    reach: l.metricsReach ?? 0,
  }))

  return NextResponse.json({
    windowDays: WINDOW_DAYS,
    summary,
    topPosts,
    recent,
  })
}
