import { db } from "@/lib/db"
import { approvalLink, client as clientTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { generateId } from "@/lib/utils"

// Approval-link helpers shared by:
//   - the cron sweep in trigger/publish.ts (creates per-post tokens and
//     dispatches via Meta Cloud WhatsApp)
//   - the public approval API in app/api/approve/[token]/route.ts (the
//     client decides on /approve/{token})
//   - the public client-calendar API in app/api/c/[token]/route.ts (the
//     client browses all their posts on /c/{client-token})
//
// Two distinct token types:
//   1. approvalLink.token — TTL 30d, per-post, single-use. After 30d
//      without explicit decision (sentVia=meta_cloud only), the tacit-
//      approval cron auto-decides as approved (silence = yes).
//   2. client.publicCalendarToken — permanent, per-client, never expires.
//      Generated lazily on first request via getOrCreateClientCalendarToken.

/** Single source of truth pra TTL de approval links. 30 dias desde
 * sentAt (não desde createdAt) — só conta tempo depois que o cliente
 * realmente recebeu a notificação. Antes valia 14, mudou pra 30 pra
 * dar margem confortável dado que silêncio = aprovação tácita. */
export const APPROVAL_TTL_DAYS = 30

/** Calcula expiresAt a partir do momento de envio real. Retorna null se
 * sentAt é null (link criado mas WhatsApp ainda não disparou). Caller
 * deve persistir esse valor lazy quando sentAt é setado, NÃO no insert. */
export function computeExpiresAt(sentAt: Date | string | null): Date | null {
  if (!sentAt) return null
  const ts = typeof sentAt === "string" ? new Date(sentAt) : sentAt
  return new Date(ts.getTime() + APPROVAL_TTL_DAYS * 24 * 60 * 60 * 1000)
}

/** True quando o link é elegível pra tacit auto-approval AGORA:
 *   - decision IS NULL (não decidido)
 *   - tacit IS false (sweep não rodou ainda)
 *   - sentVia === 'meta_cloud' (envio Meta confirmado — wa.me manual
 *     não conta porque agency pode não ter clicado)
 *   - sentAt + 30d <= now
 * Usado pelo cron tacitApprovalSweep pra filtrar candidatos. */
export function isTacitDue(row: {
  sentAt: Date | string | null
  decision: string | null
  tacit: boolean
  sentVia: string | null
}): boolean {
  if (row.decision !== null) return false
  if (row.tacit) return false
  if (row.sentVia !== "meta_cloud") return false
  if (!row.sentAt) return false
  const expires = computeExpiresAt(row.sentAt)
  if (!expires) return false
  return expires.getTime() <= Date.now()
}

/** Lazily creates the permanent calendar token for a client and returns it.
 * Idempotent: subsequent calls return the same token. The token is
 * cryptographically random (~32 chars) and embedded in the public URL
 * /c/{token} that the agency shares with the client via WhatsApp once. */
export async function getOrCreateClientCalendarToken(clientId: string): Promise<string> {
  const [row] = await db
    .select({ token: clientTable.publicCalendarToken })
    .from(clientTable)
    .where(eq(clientTable.id, clientId))

  if (row?.token) return row.token

  // generateId returns 24+ chars; double it to ~48 to make brute-forcing
  // infeasible. Concatenation is safe because generateId values are
  // already URL-safe.
  const token = generateId() + generateId().replace(/-/g, "")
  await db
    .update(clientTable)
    .set({ publicCalendarToken: token, updatedAt: new Date() })
    .where(eq(clientTable.id, clientId))

  return token
}

export type ApprovalDecision = "approved" | "changes_requested"

/** Validate that a decision string is one we recognize. Defensive — the
 * UI sends one of two literal values; anything else is a malformed
 * request and we 400 it. */
export function isApprovalDecision(value: unknown): value is ApprovalDecision {
  return value === "approved" || value === "changes_requested"
}

/** True when the link's expiresAt is in the past. Used by both the GET
 * (which renders an expired-state page) and POST (which 410s the
 * decision attempt). */
export function isApprovalExpired(expiresAt: Date | string): boolean {
  const ts = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt
  return ts.getTime() <= Date.now()
}

/** True when the link has already been decided (decision is set). After
 * a decision the same token can't be reused — the client either sees
 * the decision page or, on the calendar page, the post is no longer in
 * the "pending" tab. */
export function isApprovalDecided(decision: string | null): boolean {
  return decision !== null
}

export type LookupResult =
  | { kind: "ok"; row: typeof approvalLink.$inferSelect }
  | { kind: "not_found" }
  | { kind: "expired"; row: typeof approvalLink.$inferSelect }
  | { kind: "decided"; row: typeof approvalLink.$inferSelect }

/** Lookup a per-post approval token and classify its state. The caller
 * decides what to render (page) or status to return (API).
 *
 * Estados:
 *   - decision='approved' (tacit=true ou false): "decided" — caller olha
 *     row.tacit pra renderizar "Aprovado" vs "Aprovação tácita".
 *   - decision='changes_requested': "decided".
 *   - decision='expired': "expired" — sintético do cron pra orphan/
 *     cancelled (Notion status moveu pra fora do "aguardando").
 *     Distinto de tacit, que vira "approved".
 *   - decision IS NULL + expiresAt no passado: "ok" (sweep ainda vai
 *     rodar). UI mostra warning "aprovação automática iminente" se sentVia=meta_cloud.
 *   - decision IS NULL + expiresAt no futuro: "ok" (pendente normal). */
export async function lookupApprovalLink(token: string): Promise<LookupResult> {
  const [row] = await db
    .select()
    .from(approvalLink)
    .where(eq(approvalLink.token, token))

  if (!row) return { kind: "not_found" }
  if (row.decision === "expired") return { kind: "expired", row }
  if (row.decision !== null) return { kind: "decided", row }
  return { kind: "ok", row }
}
