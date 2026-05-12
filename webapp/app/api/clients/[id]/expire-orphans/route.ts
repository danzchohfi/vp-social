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

  let totalExpired = 0
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
    let awaitingPosts: Array<{ pageId: string }> = []
    try {
      awaitingPosts = await notion.getPostsByStatus(conn.databaseId, mapping, mapping.awaitingApprovalValue)
    } catch (e) {
      details.push({ connectionId: conn.id, expired: 0, awaiting: 0, reason: `getPostsByStatus failed: ${e}` })
      continue
    }
    const awaitingIds = new Set(awaitingPosts.map((p) => p.pageId))

    const existing = await db
      .select({
        id: approvalLink.id,
        notionPageId: approvalLink.notionPageId,
        sentVia: approvalLink.sentVia,
      })
      .from(approvalLink)
      .where(and(
        eq(approvalLink.clientId, id),
        eq(approvalLink.connectionId, conn.id),
        eq(approvalLink.kind, "post"),
        isNull(approvalLink.decision),
      ))

    const orphanIds = existing
      .filter((r) => r.notionPageId && !awaitingIds.has(r.notionPageId))
      .filter((r) => r.sentVia === "none" || r.sentVia === "invalid_phone" || !r.sentVia)
      .map((r) => r.id)

    if (orphanIds.length > 0) {
      await db
        .update(approvalLink)
        .set({ decision: "expired", decidedAt: new Date() })
        .where(inArray(approvalLink.id, orphanIds))
    }

    totalExpired += orphanIds.length
    details.push({ connectionId: conn.id, expired: orphanIds.length, awaiting: awaitingPosts.length })
  }

  return NextResponse.json({
    expired: totalExpired,
    connectionsScanned: connections.length,
    details,
  })
}
