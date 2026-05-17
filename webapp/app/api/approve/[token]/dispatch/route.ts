import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { approvalLink, client as clientTable, notionConnection } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { dispatchApprovalRequest, getUserWhatsappConfig } from "@/lib/whatsapp-dispatch"
import { createNotionClient } from "@/lib/notion"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://producao.app"

// Per-post manual dispatch. Lets the agency fire a WhatsApp for a
// SPECIFIC pending link — not the bulk notify-pending. Idempotent: if
// the row was already sent we still try, because the agency might be
// intentionally re-sending.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { token } = await params
  const [link] = await db
    .select()
    .from(approvalLink)
    .where(eq(approvalLink.token, token))
    .limit(1)
  if (!link) return NextResponse.json({ error: "Token não encontrado" }, { status: 404 })
  if (!link.clientId) return NextResponse.json({ error: "Link sem clientId" }, { status: 400 })

  const ok = await userIsClientOwner(session.user.id, link.clientId)
  if (!ok) return NextResponse.json({ error: "Sem acesso a este cliente" }, { status: 403 })

  if (!link.contactPhone) {
    return NextResponse.json({
      ok: false,
      reason: "Este link não tem telefone resolvido — não dá pra disparar via WhatsApp.",
    })
  }

  const [c] = await db
    .select({ userId: clientTable.userId })
    .from(clientTable)
    .where(eq(clientTable.id, link.clientId))
  if (!c) {
    return NextResponse.json({ ok: false, reason: "Cliente não encontrado." })
  }
  const config = await getUserWhatsappConfig(c.userId)

  const approvalUrl = `${APP_URL}/approve/${link.token}`
  const result = await dispatchApprovalRequest({
    config,
    phone: link.contactPhone,
    contactName: link.contactName,
    postTitle: link.postTitle ?? "",
    approvalUrl,
  })

  if (result.ok) {
    await db
      .update(approvalLink)
      .set({ sentVia: "meta_cloud", sentAt: new Date(), lastError: null })
      .where(eq(approvalLink.token, token))

    // Audit comment in Notion (best-effort, mirrors the cron behavior).
    try {
      const [conn] = await db
        .select({ accessToken: notionConnection.accessToken })
        .from(notionConnection)
        .where(and(
          eq(notionConnection.clientId, link.clientId),
        ))
        .limit(1)
      if (conn?.accessToken && link.notionPageId) {
        const notion = createNotionClient(conn.accessToken)
        await notion.postSystemComment(
          link.notionPageId,
          `🔔 Aprovação solicitada (disparo manual deste post) via WhatsApp pra ${link.contactName ?? link.contactPhone} · ${new Date().toLocaleString("pt-BR")}`,
        )
      }
    } catch {
      // best-effort
    }

    return NextResponse.json({
      ok: true,
      phone: link.contactPhone,
      contactName: link.contactName,
      postTitle: link.postTitle,
    })
  }

  await db
    .update(approvalLink)
    .set({ lastError: `meta_cloud: ${result.reason}` })
    .where(eq(approvalLink.token, token))

  return NextResponse.json({
    ok: false,
    reason: result.reason,
    phone: link.contactPhone,
    contactName: link.contactName,
    postTitle: link.postTitle,
  })
}
