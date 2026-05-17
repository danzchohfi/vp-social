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
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  const { url } = body as { url?: string }
  if (typeof url !== "string") return NextResponse.json({ error: "url obrigatório" }, { status: 400 })

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
    const properties = (database as any).properties as Record<string, any>
    const props = Object.entries(properties).map(([n, p]) => {
      const type = p.type as string
      let options: string[] = []
      if (type === "status") options = (p.status?.options ?? []).map((o: any) => o.name)
      else if (type === "select") options = (p.select?.options ?? []).map((o: any) => o.name)
      else if (type === "multi_select") options = (p.multi_select?.options ?? []).map((o: any) => o.name)
      return { name: n, type, options }
    })

    await db
      .update(notionConnection)
      .set({ databaseId, databaseName: name, updatedAt: new Date() })
      .where(eq(notionConnection.id, connectionId))

    return NextResponse.json({ id: databaseId, name, props })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Erro ao conectar banco" }, { status: 400 })
  }
}
