import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { approvalLink, client as clientTable, notionConnection } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { dispatchApprovalRequest } from "@/lib/whatsapp-dispatch"
import { createNotionClient } from "@/lib/notion"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://posts.vitaminapublicitaria.com.br"

// Per-post manual dispatch. Lets the agency fire a WhatsApp for a
// SPECIFIC pending link — not the bulk notify-pending which fans out
// to every group. Used when the user wants to target one post they
// know about and verify the contact+phone before/after.
//
// Idempotent on the dispatch result: if sentVia is already 'manychat'
// we still try, because the agency might be intentionally re-sending.
// Updates sentVia + lastError on the row so /scheduled reflects the
// new state.
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

  // Load the client's WhatsApp config (both providers). The dispatcher
  // picks based on client.whatsappProvider.
  const [c] = await db
    .select({
      whatsappProvider: clientTable.whatsappProvider,
      manychatApiKey: clientTable.manychatApiKey,
      manychatApprovalFlowNs: clientTable.manychatApprovalFlowNs,
      metaWaToken: clientTable.metaWaToken,
      metaPhoneNumberId: clientTable.metaPhoneNumberId,
      metaTemplateName: clientTable.metaTemplateName,
      metaTemplateLanguage: clientTable.metaTemplateLanguage,
    })
    .from(clientTable)
    .where(eq(clientTable.id, link.clientId))
  if (!c) {
    return NextResponse.json({ ok: false, reason: "Cliente não encontrado." })
  }

  const approvalUrl = `${APP_URL}/approve/${link.token}`
  const result = await dispatchApprovalRequest({
    client: {
      whatsappProvider: c.whatsappProvider,
      manychatApiKey: c.manychatApiKey,
      manychatApprovalFlowNs: c.manychatApprovalFlowNs,
      metaWaToken: c.metaWaToken,
      metaPhoneNumberId: c.metaPhoneNumberId,
      metaTemplateName: c.metaTemplateName,
      metaTemplateLanguage: c.metaTemplateLanguage,
    },
    phone: link.contactPhone,
    contactName: link.contactName,
    postTitle: link.postTitle ?? "",
    approvalUrl,
  })

  if (result.ok) {
    await db
      .update(approvalLink)
      .set({ sentVia: result.provider, sentAt: new Date(), lastError: null })
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
    .set({ lastError: `${result.provider ?? "dispatch"}: ${result.reason}` })
    .where(eq(approvalLink.token, token))

  return NextResponse.json({
    ok: false,
    reason: result.reason,
    phone: link.contactPhone,
    contactName: link.contactName,
    postTitle: link.postTitle,
  })
}
