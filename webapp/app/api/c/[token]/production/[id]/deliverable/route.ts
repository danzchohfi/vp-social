import { db } from "@/lib/db"
import {
  client as clientTable,
  fieldMapping,
  notionConnection,
  production,
} from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

// Versão pública do /api/productions/[id]/deliverable, auth pelo calendar
// token do client. Quando a agência entrega arquivos sem publicar, o
// cliente baixa direto aqui — bandwidth fica no CDN do Notion (302).
// URLs do Notion expiram em ~1h, então buscamos fresca on-demand.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params

  // Rate limit conservador — endpoint dispara live Notion query.
  const ip = clientIp(req)
  if (checkRateLimit(`c-dl:${ip}`, { max: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  const url = new URL(req.url)
  const orientation = url.searchParams.get("orientation")
  if (orientation !== "vertical" && orientation !== "horizontal") {
    return NextResponse.json(
      { error: "orientation deve ser 'vertical' ou 'horizontal'" },
      { status: 400 },
    )
  }

  const [client] = await db
    .select()
    .from(clientTable)
    .where(eq(clientTable.publicCalendarToken, token))
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const [prod] = await db
    .select()
    .from(production)
    .where(and(eq(production.id, id), eq(production.clientId, client.id)))
  if (!prod) return NextResponse.json({ error: "not_found" }, { status: 404 })

  if (!prod.notionPageId) {
    return NextResponse.json({ error: "Produção sem página Notion conectada" }, { status: 404 })
  }

  const conns = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, client.id))
  const conn = conns.find((c) => c.databaseId) ?? conns[0]
  if (!conn) {
    return NextResponse.json({ error: "Sem Notion conectado pro cliente" }, { status: 404 })
  }

  const mappingRows = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, conn.id))
  const mapping = mappingRows[0] ?? DEFAULT_MAPPING

  const notion = createNotionClient(conn.accessToken)
  // expectedDatabaseId garante que a página é deste DB (mesmo MED-3 fix
  // que aplicamos no /post/[pageId]).
  const post = await notion.getPostById(prod.notionPageId, mapping, conn.databaseId)
  if (!post) return NextResponse.json({ error: "Página Notion não encontrada" }, { status: 404 })

  const urls = orientation === "vertical" ? post.verticalUrls : post.horizontalUrls
  const fresh = urls[0]
  if (!fresh) {
    return NextResponse.json(
      { error: `Sem arquivo no campo ${orientation === "vertical" ? mapping.mediaVerticalField : mapping.mediaHorizontalField}` },
      { status: 404 },
    )
  }
  return NextResponse.redirect(fresh, 302)
}
