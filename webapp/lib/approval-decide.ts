// Single source of truth pra "uma decisão de aprovação aconteceu".
// Compartilhado entre:
//   - API pública /api/approve/[token] (cliente clica Aprovar/Pedir alterações)
//   - cron tacitApprovalSweep (silêncio em 30d → aprovação tácita)
// Mantém atomic claim (UPDATE WHERE decision IS NULL) idempotente +
// roda side-effects (Notion flip, advance chain, email pra agency).

import { db } from "@/lib/db"
import {
  approvalLink,
  client as clientTable,
  fieldMapping,
  notionConnection,
  production,
  productionComment,
} from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping } from "@/lib/notion"
import { advanceChain } from "@/lib/productions"
import { dispatchApprovalRequest, getUserWhatsappConfig } from "@/lib/whatsapp-dispatch"
import { notifyClientDecisionAsync } from "@/lib/email-notifications"
import { generateId } from "@/lib/utils"
import type { ApprovalDecision } from "@/lib/approval-link"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://posts.vitaminapublicitaria.com.br"

type ApprovalRow = typeof approvalLink.$inferSelect

export type DecideArgs = {
  row: ApprovalRow
  decision: ApprovalDecision
  // 'explicit' = client tap on /approve. 'tacit' = cron auto-decide after
  // 30d of silence (sentVia=meta_cloud only). Tacit is only valid for
  // 'approved' — silêncio nunca significa "pede alterações".
  mode: "explicit" | "tacit"
  comment?: string | null
  ip?: string | null
}

export type DecideResult =
  | { ok: true }
  | { ok: false; reason: "already_decided"; existing: string | null }
  | { ok: false; reason: "invalid_tacit" }

export async function decideApprovalLink(args: DecideArgs): Promise<DecideResult> {
  if (args.mode === "tacit" && args.decision !== "approved") {
    return { ok: false, reason: "invalid_tacit" }
  }

  const now = new Date()
  const tacit = args.mode === "tacit"

  // Atomic claim: ganha quem chega primeiro (cron vs client). Idempotente
  // — se decision já está setada, returning vem vazio.
  const claim = await db
    .update(approvalLink)
    .set({
      decision: args.decision,
      tacit,
      decidedAt: now,
      decidedFromIp: args.ip ?? null,
      comment: args.comment || null,
    })
    .where(and(
      eq(approvalLink.id, args.row.id),
      isNull(approvalLink.decision),
    ))
    .returning({ id: approvalLink.id })

  if (claim.length === 0) {
    const [latest] = await db
      .select({ decision: approvalLink.decision })
      .from(approvalLink)
      .where(eq(approvalLink.id, args.row.id))
    return { ok: false, reason: "already_decided", existing: latest?.decision ?? null }
  }

  // Side effects discriminated por kind.
  if (args.row.kind === "production_script" && args.row.productionId) {
    await applyProductionDecision(args.row, args.decision, args.comment, tacit)
  } else {
    await applyPostDecision(args.row, args.decision, args.comment, tacit)
  }

  // Email pra agency (fire-and-forget; falha de Resend não rompe o fluxo).
  try {
    const [ownerClient] = await db
      .select({ name: clientTable.name, userId: clientTable.userId })
      .from(clientTable)
      .where(eq(clientTable.id, args.row.clientId))
    if (ownerClient?.userId) {
      notifyClientDecisionAsync(ownerClient.userId, ownerClient.name ?? null, {
        postTitle: args.row.postTitle,
        contactName: args.row.contactName,
        decision: args.decision,
        comment: args.comment || null,
        approvalUrl: `${APP_URL}/approve/${args.row.token}`,
        notionPageId: args.row.notionPageId,
        tacit,
      })
    }
  } catch (e) {
    console.warn(`[decideApprovalLink] notify failed for ${args.row.token}:`, e)
  }

  return { ok: true }
}

async function applyProductionDecision(
  row: ApprovalRow,
  decision: ApprovalDecision,
  comment: string | null | undefined,
  _tacit: boolean,
) {
  if (!row.productionId) return
  if (decision === "approved") {
    try {
      const next = await advanceChain(db, row.productionId, row.round ?? 1)
      if (next.kind === "next") {
        const [c] = await db
          .select({ userId: clientTable.userId })
          .from(clientTable)
          .where(eq(clientTable.id, row.clientId))
        let nextSentVia: "meta_cloud" | "none" = "none"
        if (c && next.approver.phone) {
          const config = await getUserWhatsappConfig(c.userId)
          const sendResult = await dispatchApprovalRequest({
            config,
            phone: next.approver.phone,
            contactName: next.approver.name,
            postTitle: next.approvalLinkRow.postTitle,
            approvalUrl: `${APP_URL}/approve/${next.approvalLinkRow.token}`,
          })
          if (sendResult.ok) nextSentVia = "meta_cloud"
        }
        await db
          .update(approvalLink)
          .set({ sentVia: nextSentVia, sentAt: nextSentVia === "none" ? null : new Date() })
          .where(eq(approvalLink.id, next.approvalLinkRow.id))
      } else {
        await db
          .update(production)
          .set({ status: "approved", updatedAt: new Date() })
          .where(eq(production.id, row.productionId))
      }
    } catch (e) {
      console.error(`[decideApprovalLink] advanceChain failed for production ${row.productionId}:`, e)
    }
  } else {
    try {
      if (comment) {
        await db.insert(productionComment).values({
          id: generateId(),
          productionId: row.productionId,
          authorUserId: null,
          authorName: row.contactName ?? "Cliente",
          body: comment,
        })
      }
      await db
        .update(production)
        .set({ status: "revision_requested", updatedAt: new Date() })
        .where(eq(production.id, row.productionId))
    } catch (e) {
      console.error(`[decideApprovalLink] production revision side-effects failed:`, e)
    }
  }
}

async function applyPostDecision(
  row: ApprovalRow,
  decision: ApprovalDecision,
  comment: string | null | undefined,
  tacit: boolean,
) {
  if (!row.connectionId) return
  const [conn] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.id, row.connectionId))
  if (!conn) {
    console.warn(`[decideApprovalLink] connection ${row.connectionId} gone, skipping Notion side-effects`)
    return
  }

  const [mappingRow] = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, conn.id))
  const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING

  const notion = createNotionClient(conn.accessToken)
  const who = row.contactName ?? "Cliente"
  const when = new Date().toLocaleString("pt-BR")

  try {
    if (decision === "approved") {
      await notion.markApproved(row.notionPageId, mapping)
      const sentDate = row.sentAt
        ? new Date(row.sentAt).toLocaleDateString("pt-BR")
        : "?"
      const auditMsg = tacit
        ? `✓ Aprovação automática · sem resposta em 30 dias desde ${sentDate}`
        : `✓ Aprovado por ${who} · ${when}`
      await notion.postSystemComment(row.notionPageId, auditMsg)
    } else {
      await notion.markRevision(row.notionPageId, mapping)
      await notion.postSystemComment(
        row.notionPageId,
        `🔁 Pedido alterações por ${who} · ${when}`,
      )
      if (comment) {
        await notion.addClientComment(row.notionPageId, comment, row.contactName ?? null)
      }
    }
  } catch (e) {
    console.error(`[decideApprovalLink] Notion side-effect failed for token ${row.token}:`, e)
  }
}
