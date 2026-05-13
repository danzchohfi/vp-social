import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

// One-shot cleanup: depois que Fase 11 (PR #103) entrou em main mas
// antes da Fase 12 (PR #104) entrar, o cron tentou dispatch Meta em
// todo post pendente. Como userWhatsappConfig estava vazio, cada tick
// gravava uma row em publish_log com platform='aprovação' status='failed'
// error~"WhatsApp não configurado..." — falsos erros que poluíam
// /history e o widget de publicações recentes. Idem em approval_link.last_error.
//
// Auth: qualquer usuário autenticado (sessão Better Auth via cookie).
// Op é estritamente delete-failures + clear-error-strings, não afeta
// dados de negócio. Idempotente: segunda chamada retorna 0 affected.
//
// GET executa direto (em vez de só preview) pra o owner poder limpar
// abrindo a URL no navegador, sem curl — endpoint é one-shot e a sessão
// gateia o acesso. Removo o endpoint após uso.

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const deletedLogs = await db.execute(sql`
    DELETE FROM publish_log
    WHERE platform = 'aprovação'
      AND status = 'failed'
      AND error LIKE '%WhatsApp não configurado%'
    RETURNING id
  `)

  const updatedLinks = await db.execute(sql`
    UPDATE approval_link
    SET last_error = NULL
    WHERE last_error LIKE '%WhatsApp não configurado%'
    RETURNING id
  `)

  return NextResponse.json({
    deletedPublishLog: deletedLogs.rows.length,
    clearedApprovalLinkErrors: updatedLinks.rows.length,
  })
}
