import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { approvalLink, fieldMapping, notionConnection } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"

// Dump every pending approvalLink for a client with full context so
// the agency can identify each row when the dashboard count doesn't
// match what they see in Notion. Used when "Limpar órfãos" returns
// zero but the count is still surprising.
//
// Returns per-link: title, contact, phone, sentVia, lastError,
// createdAt, the Notion page URL, AND whether the cron currently
// sees the page in awaiting status (across ALL connections of this
// client). The "stillAwaiting" flag is the key signal — true means
// the row is legitimately pending, false means it should've been
// cleaned but the cleanup logic missed it.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const ok = await userIsClientOwner(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const connections = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, id))

  // Build union of awaiting pageIds across all connections.
  const awaitingByConnection: Array<{ connectionId: string; pageIds: string[]; error?: string }> = []
  const allAwaiting = new Set<string>()
  for (const conn of connections) {
    if (!conn.databaseId) {
      awaitingByConnection.push({ connectionId: conn.id, pageIds: [], error: "Sem databaseId" })
      continue
    }
    const [mappingRow] = await db
      .select()
      .from(fieldMapping)
      .where(eq(fieldMapping.connectionId, conn.id))
    const mapping = { ...DEFAULT_MAPPING, ...mappingRow }
    if (!mapping.awaitingApprovalValue) {
      awaitingByConnection.push({ connectionId: conn.id, pageIds: [], error: "Sem awaitingApprovalValue" })
      continue
    }
    try {
      const notion = createNotionClient(conn.accessToken)
      const posts = await notion.getPostsByStatus(conn.databaseId, mapping, mapping.awaitingApprovalValue)
      const pageIds = posts.map((p) => p.pageId)
      awaitingByConnection.push({ connectionId: conn.id, pageIds })
      for (const id of pageIds) allAwaiting.add(id)
    } catch (e) {
      awaitingByConnection.push({ connectionId: conn.id, pageIds: [], error: e instanceof Error ? e.message : String(e) })
    }
  }

  // All pending links for the client (no connectionId filter).
  const links = await db
    .select({
      id: approvalLink.id,
      token: approvalLink.token,
      notionPageId: approvalLink.notionPageId,
      postTitle: approvalLink.postTitle,
      contactName: approvalLink.contactName,
      contactPhone: approvalLink.contactPhone,
      sentVia: approvalLink.sentVia,
      sentAt: approvalLink.sentAt,
      lastError: approvalLink.lastError,
      connectionId: approvalLink.connectionId,
      createdAt: approvalLink.createdAt,
      expiresAt: approvalLink.expiresAt,
    })
    .from(approvalLink)
    .where(and(
      eq(approvalLink.clientId, id),
      eq(approvalLink.kind, "post"),
      isNull(approvalLink.decision),
    ))

  const pendingDetails = links.map((l) => ({
    ...l,
    notionUrl: l.notionPageId ? `https://www.notion.so/${l.notionPageId.replace(/-/g, "")}` : null,
    stillAwaiting: l.notionPageId ? allAwaiting.has(l.notionPageId) : false,
  }))

  // Diagnose why orphan cleanup might not be expiring rows:
  //   - row.stillAwaiting === true → legitimately pending
  //   - row.stillAwaiting === false AND sentVia in (null,'none','invalid_phone') → SHOULD be expired (bug)
  //   - row.stillAwaiting === false AND sentVia === 'manychat' → kept on purpose (live WhatsApp link)
  const shouldBeExpired = pendingDetails.filter((p) => !p.stillAwaiting && (p.sentVia === "none" || p.sentVia === "invalid_phone" || !p.sentVia))
  const liveSentNotInAwaiting = pendingDetails.filter((p) => !p.stillAwaiting && p.sentVia === "manychat")

  return NextResponse.json({
    totalPending: links.length,
    totalAwaitingAcrossConnections: allAwaiting.size,
    pending: pendingDetails.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    awaitingByConnection,
    shouldBeExpiredCount: shouldBeExpired.length,
    liveSentNotInAwaitingCount: liveSentNotInAwaiting.length,
  })
}
