import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"

function extractNotionId(input: string): string {
  const match = input.match(/([a-f0-9]{32})/i)
  if (match) {
    const raw = match[1]
    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
  }
  return input.trim()
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: connectionId } = await params
  const { url } = await req.json()

  const [connection] = await db
    .select()
    .from(notionConnection)
    .where(and(eq(notionConnection.id, connectionId), eq(notionConnection.userId, session.user.id)))

  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 })

  const databaseId = extractNotionId(url)

  try {
    const notion = new Client({ auth: connection.accessToken })
    const database = await notion.databases.retrieve({ database_id: databaseId })

    const name = (database as any).title?.[0]?.plain_text ?? "Sem nome"
    const props = Object.keys((database as any).properties)

    await db
      .update(notionConnection)
      .set({ databaseId, databaseName: name, updatedAt: new Date() })
      .where(eq(notionConnection.id, connectionId))

    return NextResponse.json({ id: databaseId, name, props })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Erro ao conectar banco" }, { status: 400 })
  }
}
