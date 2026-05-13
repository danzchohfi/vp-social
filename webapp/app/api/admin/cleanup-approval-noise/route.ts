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
// GET  → conta linhas que serão afetadas (preview seguro)
// POST → DELETE + UPDATE no que o GET retornou
//
// Idempotente: rodar duas vezes apenas retorna 0 affected na segunda.
// Auth: qualquer usuário autenticado. Op é estritamente delete-failures
// + clear-error-strings, não afeta dados de negócio.

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [logsCount] = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM publish_log
    WHERE platform = 'aprovação'
      AND status = 'failed'
      AND error LIKE '%WhatsApp não configurado%'
  `).then((r) => r.rows as { count: number }[])

  const [linksCount] = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM approval_link
    WHERE last_error LIKE '%WhatsApp não configurado%'
  `).then((r) => r.rows as { count: number }[])

  return NextResponse.json({
    publishLogRows: logsCount?.count ?? 0,
    approvalLinkRows: linksCount?.count ?? 0,
  })
}

export async function POST() {
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
