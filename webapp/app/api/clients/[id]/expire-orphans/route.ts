import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { approvalLink, fieldMapping, notionConnection } from "@/lib/db/schema"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"

// On-demand orphan cleanup. Mirrors the cron sweep's expiration step
// but runs immediately. Used by the /dashboard "Limpar pendências
// obsoletas" button when the count looks wrong relative to what the
// user sees in Notion (e.g. dashboard shows 10, Notion shows 1).
//
// Orphan = approvalLink with decision IS NULL whose Notion post is no
// longer in the awaiting-approval status. We only flip rows that were
// never successfully dispatched (sentVia null/'none'/'invalid_phone')
// so any live WhatsApp link the client received keeps working.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const ok = await userIsClientOwner(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const connections = await db
    .select({ id: notionConnection.id, databaseId: notionConnection.databaseId, accessToken: notionConnection.accessToken })
    .from(notionConnection)
    .where(eq(notionConnection.clientId, id))

  // Fetch awaiting posts across ALL connections of this client up
  // front. Build a single global set of pageIds the cron considers
  // "still awaiting". A pending approvalLink whose notionPageId isn't
  // in this union — regardless of its own connectionId — is an
  // orphan. Catches legacy rows with connectionId=null too.
  const allAwaiting = new Set<string>()
  const details: Array<{ connectionId: string; expired: number; awaiting: number; reason?: string }> = []
  for (const conn of connections) {
    if (!conn.databaseId) continue
    const [mappingRow] = await db
      .select()
      .from(fieldMapping)
      .where(eq(fieldMapping.connectionId, conn.id))
    const mapping = { ...DEFAULT_MAPPING, ...mappingRow }
    if (!mapping.awaitingApprovalValue) {
      details.push({ connectionId: conn.id, expired: 0, awaiting: 0, reason: "Sem awaitingApprovalValue configurado" })
      continue
    }
    const notion = createNotionClient(conn.accessToken)
    try {
      const awaitingPosts = await notion.getPostsByStatus(conn.databaseId, mapping, mapping.awaitingApprovalValue)
      for (const p of awaitingPosts) allAwaiting.add(p.pageId)
      details.push({ connectionId: conn.id, expired: 0, awaiting: awaitingPosts.length })
    } catch (e) {
      details.push({ connectionId: conn.id, expired: 0, awaiting: 0, reason: `getPostsByStatus failed: ${e}` })
    }
  }

  // Now query EVERY pending post link for this client (no connectionId
  // filter), so legacy rows with connectionId=null get cleaned too.
  const existing = await db
    .select({
      id: approvalLink.id,
      notionPageId: approvalLink.notionPageId,
      sentVia: approvalLink.sentVia,
      postTitle: approvalLink.postTitle,
      connectionId: approvalLink.connectionId,
    })
    .from(approvalLink)
    .where(and(
      eq(approvalLink.clientId, id),
      eq(approvalLink.kind, "post"),
      isNull(approvalLink.decision),
    ))

  const orphans = existing
    .filter((r) => !r.notionPageId || !allAwaiting.has(r.notionPageId))
    .filter((r) => r.sentVia === "none" || r.sentVia === "invalid_phone" || !r.sentVia)
  const orphanIds = orphans.map((r) => r.id)
  let totalExpired = 0
  if (orphanIds.length > 0) {
    await db
      .update(approvalLink)
      .set({ decision: "expired", decidedAt: new Date() })
      .where(inArray(approvalLink.id, orphanIds))
    totalExpired = orphanIds.length
  }
  // Surface a sample of the orphan titles + their connectionId state
  // so the UI can show "10 órfãos limpos: <titles>".
  const orphanSample = orphans.slice(0, 20).map((r) => ({
    title: r.postTitle ?? "(sem título)",
    connectionId: r.connectionId,
    notionPageId: r.notionPageId,
  }))

  return NextResponse.json({
    expired: totalExpired,
    connectionsScanned: connections.length,
    totalAwaitingAcrossConnections: allAwaiting.size,
    totalPendingLinksBefore: existing.length,
    orphanSample,
    details,
  })
}
