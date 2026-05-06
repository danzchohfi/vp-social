import { db } from "@/lib/db"
import {
  approvalLink,
  client as clientTable,
  fieldMapping,
  notionConnection,
  publishLog,
} from "@/lib/db/schema"
import { and, desc, eq, gte, isNull } from "drizzle-orm"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping, type NotionPost } from "@/lib/notion"

// Public client-calendar API. NO AUTH — the URL token IS the auth. Used
// by /c/{token} (the page) to render:
//   - Pending approvals (with embedded approval token for inline decide)
//   - Scheduled posts (next 60d)
//   - Published posts (last 90d)
// Token is permanent per client (client.publicCalendarToken). One link
// the agency shares with the client once via WhatsApp; client saves it
// and reopens whenever they want.

const PAST_WINDOW_DAYS = 90

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Look up client by permanent calendar token.
  const [client] = await db
    .select()
    .from(clientTable)
    .where(eq(clientTable.publicCalendarToken, token))

  if (!client) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // All Notion connections owned by this client (an agency might have
  // multiple workspaces per client; usually just one).
  const connections = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, client.id))

  const ready = connections.filter((c) => c.databaseId)

  // Aggregate posts per connection. Pending = awaitingApprovalValue,
  // scheduled = statusReadyValue. We fan out and collect, since each
  // workspace might use a different status mapping.
  const pendingPosts: Array<NotionPost & { connectionId: string; approvalToken: string | null }> = []
  const scheduledPosts: Array<NotionPost & { connectionId: string }> = []

  for (const conn of ready) {
    const [mappingRow] = await db
      .select()
      .from(fieldMapping)
      .where(eq(fieldMapping.connectionId, conn.id))
    const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING

    const notion = createNotionClient(conn.accessToken)

    // Pending approval
    if (mapping.awaitingApprovalValue) {
      try {
        const posts = await notion.getPostsByStatus(conn.databaseId!, mapping, mapping.awaitingApprovalValue)

        // Match each post with its pending approvalLink token (if any).
        const tokenMap = await db
          .select({
            notionPageId: approvalLink.notionPageId,
            token: approvalLink.token,
          })
          .from(approvalLink)
          .where(and(
            eq(approvalLink.clientId, client.id),
            isNull(approvalLink.decision),
          ))
        const tokenByPage = new Map(tokenMap.map((r) => [r.notionPageId, r.token]))

        for (const p of posts) {
          pendingPosts.push({
            ...p,
            connectionId: conn.id,
            approvalToken: tokenByPage.get(p.pageId) ?? null,
          })
        }
      } catch (e) {
        console.warn(`[/api/c/${token}] failed to fetch pending posts for connection ${conn.id}:`, e)
      }
    }

    // Scheduled (status = statusReadyValue, any future date or already due)
    try {
      const posts = await notion.getScheduledPosts(conn.databaseId!, mapping)
      for (const p of posts) {
        scheduledPosts.push({ ...p, connectionId: conn.id })
      }
    } catch (e) {
      console.warn(`[/api/c/${token}] failed to fetch scheduled posts for connection ${conn.id}:`, e)
    }
  }

  // Past — query publishLog directly. Group by notionPageId so we don't
  // show the same post once per platform. Pick the earliest publishedAt
  // as the group date, collect platforms.
  const cutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const pastLogs = await db
    .select()
    .from(publishLog)
    .where(and(
      eq(publishLog.clientId, client.id),
      gte(publishLog.publishedAt, cutoff),
    ))
    .orderBy(desc(publishLog.publishedAt))

  type PastEntry = {
    pageId: string
    title: string
    conta: string
    date: string
    platforms: Array<{ raw: string; status: string; postUrl: string | null }>
  }
  const pastByPage = new Map<string, PastEntry>()
  for (const log of pastLogs) {
    let entry = pastByPage.get(log.notionPageId)
    if (!entry) {
      entry = {
        pageId: log.notionPageId,
        title: log.postTitle,
        conta: log.conta,
        date: log.publishedAt.toString(),
        platforms: [],
      }
      pastByPage.set(log.notionPageId, entry)
    }
    if (log.platform && !entry.platforms.find((p) => p.raw === log.platform)) {
      entry.platforms.push({
        raw: log.platform,
        status: log.status,
        postUrl: log.platformPostUrl,
      })
    }
    if (new Date(log.publishedAt) < new Date(entry.date)) {
      entry.date = log.publishedAt.toString()
    }
  }
  const past = Array.from(pastByPage.values())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Slim down posts for the response — drop heavy fields, keep what the
  // calendar UI needs.
  function slimPost<T extends NotionPost>(p: T) {
    return {
      pageId: p.pageId,
      title: p.title,
      conta: p.conta,
      scheduledDate: p.scheduledDate,
      publishTargets: p.publishTargets,
      thumbnailUrl: p.thumbnailUrl,
      feedImageUrls: p.feedImageUrls,
      verticalUrls: p.verticalUrls,
      horizontalUrls: p.horizontalUrls,
      fullCaption: p.fullCaption,
    }
  }

  return NextResponse.json({
    client: {
      name: client.name,
      logoUrl: client.logoUrl,
    },
    pending: pendingPosts.map((p) => ({
      ...slimPost(p),
      connectionId: p.connectionId,
      approvalToken: p.approvalToken,
    })),
    scheduled: scheduledPosts.map((p) => ({
      ...slimPost(p),
      connectionId: p.connectionId,
    })),
    past,
  })
}
