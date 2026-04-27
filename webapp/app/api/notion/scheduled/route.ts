import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection, fieldMapping } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id

  const connections = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.userId, userId))

  const configured = connections.filter((c) => c.databaseId)
  if (!configured.length) return NextResponse.json({ posts: [], configured: false })

  const allPosts = await Promise.allSettled(
    configured.map(async (connection) => {
      const [mappingRow] = await db
        .select()
        .from(fieldMapping)
        .where(and(eq(fieldMapping.connectionId, connection.id), eq(fieldMapping.userId, userId)))

      const mapping = mappingRow ?? DEFAULT_MAPPING
      const notion = createNotionClient(connection.accessToken)
      const posts = await notion.getScheduledPosts(connection.databaseId!, mapping)
      return posts.map((p) => ({ ...p, workspaceName: connection.workspaceName }))
    })
  )

  const posts = allPosts
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => {
      if (!a.scheduledDate) return 1
      if (!b.scheduledDate) return -1
      return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
    })

  return NextResponse.json({ posts, configured: true })
}
