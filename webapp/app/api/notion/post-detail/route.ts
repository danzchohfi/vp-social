import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { fieldMapping, notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { userHasClientAccess } from "@/lib/active-client"

// Fetch a single Notion page on demand. Used by the past-post Preview button
// in /scheduled where we need the title/caption/media that aren't cached in
// publishLog. Read-only; doesn't modify Notion.
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const url = new URL(req.url)
  const pageId = url.searchParams.get("pageId") ?? ""
  const connectionId = url.searchParams.get("connectionId") ?? ""
  if (!pageId || !connectionId) {
    return NextResponse.json({ error: "pageId e connectionId obrigatórios" }, { status: 400 })
  }

  // Look up by id only — gate via userHasClientAccess below so members of
  // an agency-scope client can preview posts of that client (same fix as
  // publish-now/retry: connection.userId is the OWNER's id, not the
  // calling member's).
  const [conn] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.id, connectionId))

  if (!conn) return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 })
  const accessOk = conn.userId === userId
    || (conn.clientId && await userHasClientAccess(userId, conn.clientId))
  if (!accessOk) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 })
  }

  const [m] = await db.select().from(fieldMapping).where(eq(fieldMapping.connectionId, conn.id))
  const mapping = m ?? DEFAULT_MAPPING

  const notion = createNotionClient(conn.accessToken)
  const post = await notion.getPostById(pageId, mapping)
  if (!post) return NextResponse.json({ error: "Post não encontrado no Notion" }, { status: 404 })

  return NextResponse.json({ post })
}
