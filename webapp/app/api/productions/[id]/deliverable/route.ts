import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { production, fieldMapping, notionConnection, approver, productionApprover } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userHasClientAccess } from "@/lib/active-client"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { isMagicTokenExpired } from "@/lib/approvers"

// Fase 10 — entrega de arquivo. Quando o cliente aprova um roteiro de
// produção mas a agência NÃO publica pelo sistema (apenas entrega o
// arquivo), o cliente precisa baixar o vídeo aqui. URLs do Notion expiram
// em ~1h, então não dá pra cachear — buscamos URL fresca on-demand e
// 302-redirect pra ela. Bandwidth fica no CDN do Notion, não no nosso
// servidor.
//
// Auth: aceita session do dashboard (membro do client da produção) OU
// magicToken de approver via query (?token=...). O approver só precisa
// estar na chain da produção pra baixar.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const orientation = url.searchParams.get("orientation")
  const approverToken = url.searchParams.get("token")

  if (orientation !== "vertical" && orientation !== "horizontal") {
    return NextResponse.json(
      { error: "orientation deve ser 'vertical' ou 'horizontal'" },
      { status: 400 },
    )
  }

  const [prod] = await db.select().from(production).where(eq(production.id, id))
  if (!prod) return NextResponse.json({ error: "Produção não encontrada" }, { status: 404 })

  let authorized = false
  if (approverToken) {
    // Approver: ser portador de um magicToken válido E estar atribuído à
    // chain desta produção. Sem o segundo gate, qualquer approver podia
    // baixar de qualquer produção.
    const [a] = await db
      .select({ id: approver.id, magicTokenExpiresAt: approver.magicTokenExpiresAt })
      .from(approver)
      .where(eq(approver.magicToken, approverToken))
    if (a && !isMagicTokenExpired(a.magicTokenExpiresAt)) {
      const [chainRow] = await db
        .select({ approverId: productionApprover.approverId })
        .from(productionApprover)
        .where(
          and(
            eq(productionApprover.productionId, id),
            eq(productionApprover.approverId, a.id),
          ),
        )
      authorized = !!chainRow
    }
  } else {
    const session = await auth.api.getSession({ headers: await headers() })
    if (session) authorized = await userHasClientAccess(session.user.id, prod.clientId)
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!prod.notionPageId) {
    return NextResponse.json({ error: "Produção sem página Notion conectada" }, { status: 404 })
  }

  const conns = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, prod.clientId))
  const conn = conns.find((c) => c.databaseId) ?? conns[0]
  if (!conn) return NextResponse.json({ error: "Sem Notion conectado pro cliente" }, { status: 404 })

  const mappingRows = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, conn.id))
  const mapping = mappingRows[0] ?? DEFAULT_MAPPING

  const notion = createNotionClient(conn.accessToken)
  const post = await notion.getPostById(prod.notionPageId, mapping)
  if (!post) return NextResponse.json({ error: "Página Notion não encontrada" }, { status: 404 })

  const urls = orientation === "vertical" ? post.verticalUrls : post.horizontalUrls
  const fresh = urls[0]
  if (!fresh) {
    return NextResponse.json(
      { error: `Sem arquivo no campo "${orientation === "vertical" ? mapping.mediaVerticalField : mapping.mediaHorizontalField}" do Notion` },
      { status: 404 },
    )
  }

  // 302 deixa o browser baixar direto do Notion CDN.
  return NextResponse.redirect(fresh, 302)
}
