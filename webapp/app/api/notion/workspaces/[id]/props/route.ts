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

    // For relation + rollup props, surface enough metadata for the
    // /settings picker to render "<name> → DB '<title>'". Without
    // this, the user can't see WHICH database a rollup actually
    // resolves to — leading to "wait, the phone came from the
    // Contas DB, not Contatos" surprises.
    //
    // For rollups we walk: rollup.relation_property_name → the
    // underlying relation's database_id → fetch that DB's title.
    // Cached by db id within this request so we don't re-fetch for
    // every rollup column.
    const dbTitleCache = new Map<string, string>()
    async function dbTitle(dbId: string): Promise<string | null> {
      if (dbTitleCache.has(dbId)) return dbTitleCache.get(dbId)!
      try {
        const target: any = await notion.databases.retrieve({ database_id: dbId })
        const title = (target?.title ?? []).map((t: any) => t.plain_text ?? "").join("").trim() || null
        if (title) dbTitleCache.set(dbId, title)
        return title
      } catch {
        return null
      }
    }

    const props = await Promise.all(
      Object.entries(properties).map(async ([name, p]) => {
        const type = p.type as string
        let options: string[] = []
        let targetDbName: string | null = null
        let rollupRelationName: string | null = null
        let rollupPropertyName: string | null = null
        let rollupFinalDbName: string | null = null
        if (type === "status") {
          options = (p.status?.options ?? []).map((o: any) => o.name)
        } else if (type === "select") {
          options = (p.select?.options ?? []).map((o: any) => o.name)
        } else if (type === "multi_select") {
          options = (p.multi_select?.options ?? []).map((o: any) => o.name)
        } else if (type === "relation") {
          const targetDbId = p.relation?.database_id as string | undefined
          if (targetDbId) targetDbName = await dbTitle(targetDbId)
        } else if (type === "rollup") {
          // 1-hop target: where the underlying relation on THIS DB points.
          rollupRelationName = (p.rollup?.relation_property_name as string | undefined) ?? null
          if (rollupRelationName) {
            const sourceRel = properties[rollupRelationName]
            const targetDbId = sourceRel?.relation?.database_id as string | undefined
            if (targetDbId) targetDbName = await dbTitle(targetDbId)
          }
          // 2-hop case: rollup aggregates a property on the LINKED page.
          // If that property is itself a Relation (e.g. Conta page has a
          // "Contatos" relation), the rollup ultimately resolves to that
          // DB. We expose its name so the diagnostic can label the chain:
          //   "Contatos Relacionados → Contas → Contatos"
          rollupPropertyName = (p.rollup?.rollup_property_name as string | undefined) ?? null
          if (rollupPropertyName && rollupRelationName) {
            try {
              const sourceRel = properties[rollupRelationName]
              const intermediateDbId = sourceRel?.relation?.database_id as string | undefined
              if (intermediateDbId) {
                const intermediate: any = await notion.databases.retrieve({ database_id: intermediateDbId })
                const innerProp = intermediate?.properties?.[rollupPropertyName]
                if (innerProp?.type === "relation") {
                  const innerDbId = innerProp.relation?.database_id as string | undefined
                  if (innerDbId) rollupFinalDbName = await dbTitle(innerDbId)
                }
              }
            } catch {
              // best-effort; fall through with rollupFinalDbName null
            }
          }
        }
        return { name, type, options, targetDbName, rollupRelationName, rollupPropertyName, rollupFinalDbName }
      })
    )
    return NextResponse.json(props)
  } catch (e) {
    console.error("Notion props fetch error:", e)
    const message = e instanceof Error ? e.message : "Falha ao buscar propriedades do Notion"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
