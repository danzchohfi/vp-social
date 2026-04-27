import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection, fieldMapping } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id

  const [[connection], [mappingRow]] = await Promise.all([
    db.select().from(notionConnection).where(eq(notionConnection.userId, userId)),
    db.select().from(fieldMapping).where(eq(fieldMapping.userId, userId)),
  ])

  if (!connection?.databaseId) {
    return NextResponse.json({ posts: [], configured: false })
  }

  const mapping = mappingRow ?? DEFAULT_MAPPING
  const notion = createNotionClient(connection.accessToken)

  try {
    const posts = await notion.getScheduledPosts(connection.databaseId, mapping)
    return NextResponse.json({ posts, configured: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
