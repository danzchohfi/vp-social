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

  if (!connection) {
    return NextResponse.json({ error: "Conexão Notion não encontrada" }, { status: 404 })
  }
  if (!connection.databaseId) {
    return NextResponse.json({ error: "Nenhum banco de dados selecionado nesta conexão" }, { status: 400 })
  }

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
  } catch (e) {
    console.error("Notion props fetch error:", e)
    const message = e instanceof Error ? e.message : "Falha ao buscar propriedades do Notion"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
