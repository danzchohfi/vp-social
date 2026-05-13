import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  approvalLink,
  client as clientTable,
  fieldMapping,
  notionConnection,
} from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping } from "@/lib/notion"
import { buildWhatsAppClickToChatUrl } from "@/lib/phone"
import { dispatchApprovalRequest, getUserWhatsappConfig, isConfigured } from "@/lib/whatsapp-dispatch"
import { userIsClientOwner } from "@/lib/active-client"
import { generateId } from "@/lib/utils"
import { APPROVAL_TTL_DAYS } from "@/lib/approval-link"

// Debug-only endpoint to manually run the approval sweep against ONE
// post (instead of waiting for the 5-min cron). Mirrors the logic in
// trigger/publish.ts:runApprovalSweep but returns full diagnostics so
// the agency can see exactly what the cron would do.
//
// Two modes via `dispatch` flag:
//   dispatch=false → dry-run: resolves contact, creates approvalLink,
//     skips Meta Cloud. Returns the wa.me click-to-chat URL so agency
//     can manually open WhatsApp.
//   dispatch=true  → full path: also tries Meta Cloud. Returns the
//     dispatch result inline.
//
// Idempotency: if a pending approvalLink already exists for the page,
// reuses its token. Same partial unique index as the cron.
//
// Auth: owner of the connection's client only (the API key is sensitive).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 })
  }
  const pageId = typeof body.pageId === "string" ? body.pageId.trim() : ""
  const connectionId = typeof body.connectionId === "string" ? body.connectionId.trim() : ""
  const dispatch = body.dispatch === true
  if (!pageId || !connectionId) {
    return NextResponse.json({ error: "pageId e connectionId obrigatórios" }, { status: 400 })
  }

  // Load connection + access check.
  const [conn] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.id, connectionId))
  if (!conn) return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 })
  if (!conn.clientId) {
    return NextResponse.json({ error: "Conexão sem clientId — re-conecte o Notion para este cliente" }, { status: 400 })
  }
  const isOwner = await userIsClientOwner(session.user.id, conn.clientId)
  if (!isOwner) {
    return NextResponse.json({ error: "Apenas o owner do cliente pode rodar este teste" }, { status: 403 })
  }

  // Mapping + agency WhatsApp config.
  const [mappingRow] = await db.select().from(fieldMapping).where(eq(fieldMapping.connectionId, conn.id))
  const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING
  const [clientRow] = await db
    .select({ name: clientTable.name, userId: clientTable.userId })
    .from(clientTable)
    .where(eq(clientTable.id, conn.clientId))
  const waConfig = clientRow ? await getUserWhatsappConfig(clientRow.userId) : null

  const diagnostics: Record<string, unknown> = {
    connectionId: conn.id,
    workspaceName: conn.workspaceName,
    clientId: conn.clientId,
    clientName: clientRow?.name ?? null,
    mappingConfigured: {
      awaitingApprovalValue: mapping.awaitingApprovalValue || null,
      revisionRequestedValue: mapping.revisionRequestedValue || null,
      clientContactField: mapping.clientContactField || null,
      contactEmailField: mapping.contactEmailField || null,
      contactPhoneField: mapping.contactPhoneField || null,
    },
    whatsappConfigured: !!waConfig && isConfigured(waConfig),
  }

  if (!mapping.awaitingApprovalValue) {
    return NextResponse.json({
      ...diagnostics,
      error: "awaitingApprovalValue não configurado em /settings → Aprovação do cliente",
    }, { status: 400 })
  }

  // Fetch the post by id directly (read-only). If it's not in the
  // awaitingApprovalValue status the cron wouldn't pick it up — we
  // surface that as a warning but still let the test run, since the
  // agency may want to test with any post.
  const notion = createNotionClient(conn.accessToken)
  let post: Awaited<ReturnType<typeof notion.getPostById>> = null
  try {
    post = await notion.getPostById(pageId, mapping)
  } catch (e) {
    return NextResponse.json({
      ...diagnostics,
      error: `Falha ao buscar post no Notion: ${e instanceof Error ? e.message : e}`,
    }, { status: 502 })
  }
  if (!post) {
    return NextResponse.json({
      ...diagnostics,
      error: "Post não encontrado no Notion (pageId errado, ou integração sem acesso à página)",
    }, { status: 404 })
  }
  diagnostics.post = { pageId: post.pageId, title: post.title, conta: post.conta }

  // Resolve contact via the same code path the cron uses.
  let contact: Awaited<ReturnType<typeof notion.resolveContact>> = null
  try {
    contact = await notion.resolveContact(pageId, mapping)
  } catch (e) {
    return NextResponse.json({
      ...diagnostics,
      error: `Falha ao resolver contato: ${e instanceof Error ? e.message : e}`,
    }, { status: 502 })
  }
  diagnostics.contact = contact ?? { resolved: false }

  if (!contact?.email && !contact?.phone) {
    return NextResponse.json({
      ...diagnostics,
      error: "Nenhum contato resolvível — a relação no Notion (clientContactField) está vazia ou as colunas Email/Telefone não bateram com os nomes configurados",
    }, { status: 400 })
  }

  // Reuse pending approvalLink if one exists; otherwise create a new
  // one. Same idempotency rule as the cron.
  const [existing] = await db
    .select()
    .from(approvalLink)
    .where(and(
      eq(approvalLink.notionPageId, pageId),
      isNull(approvalLink.decision),
    ))
    .limit(1)

  let token: string
  let reused = false
  let expiresAt: Date

  if (existing) {
    token = existing.token
    expiresAt = existing.expiresAt instanceof Date ? existing.expiresAt : new Date(existing.expiresAt)
    reused = true
  } else {
    token = generateId() + generateId().replace(/-/g, "")
    expiresAt = new Date(Date.now() + APPROVAL_TTL_DAYS * 24 * 60 * 60 * 1000)
    await db.insert(approvalLink).values({
      id: generateId(),
      token,
      clientId: conn.clientId,
      connectionId: conn.id,
      notionPageId: pageId,
      postTitle: post.title || "Sem título",
      contactName: contact.name,
      contactEmail: contact.email,
      contactPhone: contact.phone,
      sentVia: "none",
      sentAt: null,
      expiresAt,
    }).onConflictDoNothing()
  }

  const approvalUrl = `${APP_URL || (req.headers.get("origin") ?? "")}/approve/${token}`
  const waMessage = `Olá${contact.name ? `, ${contact.name}` : ""}! Tem post pra aprovar: ${approvalUrl}`
  const waClickToChat = contact.phone ? buildWhatsAppClickToChatUrl(contact.phone, waMessage) : null

  diagnostics.approvalLink = {
    token,
    approvalUrl,
    reused,
    expiresAt: expiresAt.toISOString(),
  }
  diagnostics.waClickToChat = waClickToChat

  if (!dispatch) {
    return NextResponse.json({
      ok: true,
      mode: "dry-run",
      ...diagnostics,
      hint: "Abra o waClickToChat acima para mandar pelo seu próprio WhatsApp, ou rode novamente com {dispatch: true} para tentar Meta Cloud",
    })
  }

  // Full mode: try the agency Meta Cloud config.
  if (!contact.phone) {
    return NextResponse.json({
      ok: false,
      mode: "dispatch",
      ...diagnostics,
      dispatch: { result: { ok: false, reason: "Contato sem telefone — WhatsApp dispatch precisa do número" } },
    })
  }
  if (!clientRow || !waConfig) {
    return NextResponse.json({
      ok: false,
      mode: "dispatch",
      ...diagnostics,
      dispatch: { result: { ok: false, reason: "Cliente não encontrado" } },
    })
  }

  const result = await dispatchApprovalRequest({
    config: waConfig,
    phone: contact.phone,
    contactName: contact.name,
    postTitle: post.title || "",
    approvalUrl,
  })

  if (result.ok) {
    await db
      .update(approvalLink)
      .set({ sentVia: "meta_cloud", sentAt: new Date() })
      .where(eq(approvalLink.token, token))
  }

  return NextResponse.json({
    ok: result.ok,
    mode: "dispatch",
    ...diagnostics,
    dispatch: { result },
  })
}
