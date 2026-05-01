import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: connectionId } = await params

  const [connection] = await db
    .select()
    .from(notionConnection)
    .where(and(eq(notionConnection.id, connectionId), eq(notionConnection.userId, session.user.id)))

  if (!connection?.databaseId) return NextResponse.json([])

  try {
    const notion = new Client({ auth: connection.accessToken })
    const database = await notion.databases.retrieve({ database_id: connection.databaseId })
    const properties = (database as any).properties as Record<string, any>
    const props = Object.entries(properties).map(([name, p]) => {
      const type = p.type as string
      let options: string[] = []
      if (type === "status") {
        options = (p.status?.options ?? []).map((o: any) => o.name)
      } else if (type === "select") {
        options = (p.select?.options ?? []).map((o: any) => o.name)
      } else if (type === "multi_select") {
        options = (p.multi_select?.options ?? []).map((o: any) => o.name)
      }
      return { name, type, options }
    })
    return NextResponse.json(props)
  } catch {
    return NextResponse.json([])
  }
}
