import { db } from "@/lib/db"
import {
  approvalLink,
  notionConnection,
  publishLog,
} from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { createNotionClient } from "@/lib/notion"
import { generateId } from "@/lib/utils"

// Public comment-only endpoint. Cliente abre /approve/{token} e quer
// trocar ideia com a agency antes de decidir — clica "Mandar mensagem
// sem decidir", o texto vira comentário na página do Notion (prefixado
// com [Nome do cliente]) e a agency responde direto no Notion sidebar.
//
// NÃO altera decision do approvalLink. Permitido mesmo após decisão (pra
// continuar a conversa post-aprovação se cliente quiser tirar dúvida).
// Auth: token IS the auth (igual /api/approve/[token]).
//
// Por que não usar o WhatsApp pra agency aqui: agency já vê comments no
// Notion sidebar (notificação nativa do Notion). Duplicar via WhatsApp
// seria ruído. Cliente recebe nova mensagem WhatsApp só quando agency
// flipa status pra "Aguardando aprovação" novamente — o cron de aprovação
// gera novo approvalLink + dispara WhatsApp, exatamente como hoje.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const text = typeof body.comment === "string" ? body.comment.trim() : ""
  if (!text) {
    return NextResponse.json({ error: "comment_empty" }, { status: 400 })
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "comment_too_long" }, { status: 400 })
  }

  const [row] = await db
    .select()
    .from(approvalLink)
    .where(eq(approvalLink.token, token))

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (row.kind !== "post") {
    // production_script aprovação não tem fluxo de comments-only por enquanto.
    return NextResponse.json({ error: "not_supported_for_kind" }, { status: 400 })
  }
  if (!row.connectionId) {
    return NextResponse.json({ error: "no_connection" }, { status: 410 })
  }

  const [conn] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.id, row.connectionId))
  if (!conn) return NextResponse.json({ error: "connection_gone" }, { status: 410 })

  const notion = createNotionClient(conn.accessToken)

  try {
    await notion.addClientComment(row.notionPageId, text, row.contactName ?? null)
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    // Surface em /history pra agency notar (mesma estratégia do
    // applyPostDecision).
    try {
      await db.insert(publishLog).values({
        id: generateId(),
        userId: conn.userId,
        clientId: row.clientId,
        connectionId: conn.id,
        notionPageId: row.notionPageId,
        postTitle: row.postTitle,
        conta: row.contactName ?? "—",
        platform: "aprovação",
        status: "failed",
        error: `Falha ao postar comentário do cliente no Notion: ${errorMessage}`,
      })
    } catch (logErr) {
      console.error(`[approve/comment] also failed to write audit log:`, logErr)
    }
    return NextResponse.json({ error: "notion_comment_failed", detail: errorMessage }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
