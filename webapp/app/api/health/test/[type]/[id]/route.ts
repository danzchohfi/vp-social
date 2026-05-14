import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  instagramAccount,
  notionConnection,
  userWhatsappConfig,
} from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import {
  checkNotion,
  checkInstagram,
  checkFacebook,
  checkLinkedIn,
  checkYoutube,
  checkTiktok,
  checkWhatsapp,
} from "@/lib/integration-health"
import { listAccessibleClients } from "@/lib/active-client"

// POST /api/health/test/[type]/[id]
// Live validation pra UMA integração específica. Disparado pelo botão
// "Testar" no /health UI. Lento (faz HTTP externo) — não chama isso
// em loop.
//
// Authz: user precisa ter acesso ao cliente que dona a integração.
//
// Atualiza lastRefreshError no instagramAccount como side effect quando
// social check falha — assim o /health cached reflete o erro até a
// próxima publish bem-sucedida limpar.

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { type, id } = await params
  const userId = session.user.id
  const accessibleClients = await listAccessibleClients(userId)
  const clientIds = new Set(accessibleClients.map((c) => c.id))

  if (type === "notion") {
    const [conn] = await db
      .select()
      .from(notionConnection)
      .where(eq(notionConnection.id, id))
    if (!conn) return NextResponse.json({ error: "not_found" }, { status: 404 })
    if (conn.clientId && !clientIds.has(conn.clientId)) {
      return NextResponse.json({ error: "Sem acesso" }, { status: 403 })
    }
    const result = await checkNotion(conn.accessToken)
    return NextResponse.json({ ok: result.ok, message: result.message })
  }

  if (type === "social") {
    const [acc] = await db
      .select()
      .from(instagramAccount)
      .where(eq(instagramAccount.id, id))
    if (!acc) return NextResponse.json({ error: "not_found" }, { status: 404 })
    if (acc.clientId && !clientIds.has(acc.clientId)) {
      return NextResponse.json({ error: "Sem acesso" }, { status: 403 })
    }

    let result: { ok: boolean; message: string }
    switch (acc.platform.toLowerCase()) {
      case "instagram":
        result = await checkInstagram(acc.pageAccessToken ?? "", acc.instagramBusinessAccountId ?? acc.pageId)
        break
      case "facebook":
        result = await checkFacebook(acc.pageAccessToken ?? "", acc.pageId)
        break
      case "linkedin":
        result = await checkLinkedIn(acc.pageAccessToken ?? "")
        break
      case "youtube":
        result = await checkYoutube(acc.refreshToken ?? "")
        break
      case "tiktok":
        result = await checkTiktok(acc.refreshToken ?? "")
        break
      default:
        result = { ok: false, message: `Plataforma desconhecida: ${acc.platform}` }
    }

    // Persiste o resultado: erro alimenta o /health cached na próxima
    // chamada (lastRefreshError); sucesso limpa o erro anterior.
    if (!result.ok) {
      await db
        .update(instagramAccount)
        .set({ lastRefreshError: result.message.slice(0, 500), lastRefreshErrorAt: new Date() })
        .where(eq(instagramAccount.id, acc.id))
    } else if (acc.lastRefreshError) {
      await db
        .update(instagramAccount)
        .set({ lastRefreshError: null, lastRefreshErrorAt: null })
        .where(eq(instagramAccount.id, acc.id))
    }

    return NextResponse.json({ ok: result.ok, message: result.message })
  }

  if (type === "whatsapp") {
    // id pra whatsapp é sempre o userId (1:1). Confirma que id bate
    // com session pra não permitir testar config de outro user.
    if (id !== userId) {
      return NextResponse.json({ error: "Sem acesso" }, { status: 403 })
    }
    const [cfg] = await db
      .select()
      .from(userWhatsappConfig)
      .where(eq(userWhatsappConfig.userId, userId))
    if (!cfg?.metaWaToken || !cfg.metaPhoneNumberId) {
      return NextResponse.json({ ok: false, message: "WhatsApp não configurado" })
    }
    const result = await checkWhatsapp(cfg.metaWaToken, cfg.metaPhoneNumberId)
    return NextResponse.json({ ok: result.ok, message: result.message })
  }

  return NextResponse.json({ error: "Tipo inválido (use notion, social, whatsapp)" }, { status: 400 })
}
