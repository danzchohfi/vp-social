import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [connection] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.userId, session.user.id))

  if (!connection) return NextResponse.json({ error: "Notion not connected" }, { status: 400 })

  const notion = new Client({ auth: connection.accessToken })

  const response = await notion.search({
    filter: { value: "database", property: "object" },
    sort: { direction: "descending", timestamp: "last_edited_time" },
  })

  const databases = response.results.map((db: any) => ({
    id: db.id,
    name: db.title?.[0]?.plain_text ?? "Sem nome",
    lastEdited: db.last_edited_time,
  }))

  return NextResponse.json({ databases })
}
