import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [connection] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.userId, session.user.id))

  if (!connection) return NextResponse.json({ error: "Notion not connected" }, { status: 400 })

  const { id } = await params
  const notion = new Client({ auth: connection.accessToken })
  const database = await notion.databases.retrieve({ database_id: id })

  const properties = Object.entries((database as any).properties).map(([name, prop]: [string, any]) => ({
    name,
    type: prop.type,
    options:
      prop.type === "select"
        ? prop.select.options.map((o: any) => o.name)
        : prop.type === "status"
        ? prop.status.options.map((o: any) => o.name)
        : prop.type === "multi_select"
        ? prop.multi_select.options.map((o: any) => o.name)
        : [],
  }))

  return NextResponse.json({ properties })
}
