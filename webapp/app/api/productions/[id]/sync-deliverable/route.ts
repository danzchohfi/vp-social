import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { production, fieldMapping, notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userHasClientAccess } from "@/lib/active-client"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"

// Fase 10 — sync manual do estado do arquivo no Notion (presença em
// mídia vertical / horizontal) pra `production.hasVerticalMedia` /
// `hasHorizontalMedia`. Útil quando a agência acabou de subir o arquivo
// no Notion e quer ver o card "📦 Arquivo pronto" no portal /a/[token]
// sem esperar os 5min do cron sweep.
//
// Mesma lógica vai rodar no `publishScheduled` periódico (Fase 10 part 2).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const [prod] = await db.select().from(production).where(eq(production.id, id))
  if (!prod) return NextResponse.json({ error: "Produção não encontrada" }, { status: 404 })

  const ok = await userHasClientAccess(session.user.id, prod.clientId)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  if (!prod.notionPageId) {
    return NextResponse.json(
      { error: "Produção sem página Notion conectada" },
      { status: 400 },
    )
  }

  const conns = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, prod.clientId))
  const conn = conns.find((c) => c.databaseId) ?? conns[0]
  if (!conn) return NextResponse.json({ error: "Sem Notion conectado" }, { status: 400 })

  const mappingRows = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, conn.id))
  const mapping = mappingRows[0] ?? DEFAULT_MAPPING

  const notion = createNotionClient(conn.accessToken)
  const post = await notion.getPostById(prod.notionPageId, mapping)
  if (!post) {
    return NextResponse.json({ error: "Página Notion não encontrada" }, { status: 404 })
  }

  const hasVertical = post.verticalUrls.length > 0
  const hasHorizontal = post.horizontalUrls.length > 0
  await db
    .update(production)
    .set({
      hasVerticalMedia: hasVertical,
      hasHorizontalMedia: hasHorizontal,
      deliverableSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(production.id, id))

  return NextResponse.json({
    ok: true,
    hasVerticalMedia: hasVertical,
    hasHorizontalMedia: hasHorizontal,
    syncedAt: new Date().toISOString(),
  })
}
