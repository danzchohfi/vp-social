/**
 * Approver helpers — agency-scoped reusable contacts with magic-link
 * tokens (Wave 1, May 2026). Used by lib/productions.ts (chain advance)
 * and the /a/[token] portal route (Wave 2).
 *
 * Scope rule: an approver belongs to ONE agency owner (userId). The same
 * person at multiple agencies = multiple rows. This keeps the magic-link
 * portal listing scoped: one token only sees pending items inside one
 * agency's clients.
 */

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"
import * as schema from "./db/schema"
import { generateId } from "./utils"

/** Generates a 64-char hex magic token. Two generateIds concatenated so
 *  the entropy matches the existing approvalLink.token format. */
function newMagicToken(): string {
  return generateId() + generateId().replace(/-/g, "")
}

// 1 ano. Token vencido força agência a rotacionar — caso aprovador saia
// do papel e leve o link adiante, o vazamento expira automaticamente.
export const MAGIC_TOKEN_TTL_DAYS = 365
function newMagicTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + MAGIC_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
}

/** True quando o token expirou. Tokens antigos sem expiresAt (pre-MED-4)
 *  são considerados válidos — backfilled via cron quando aparecer. */
export function isMagicTokenExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) <= new Date()
}

type Db = any

// ─── Find or create ─────────────────────────────────────

/**
 * Idempotent upsert by (userId, phone) OR (userId, email) — whichever
 * the caller provides. Used when the chain editor lets the user "create
 * approver inline" from a production sidebar; if a matching row already
 * exists, we attach to it instead of duplicating.
 *
 * Phone match is exact (caller normalizes to E.164). Email match is
 * case-insensitive lower.
 */
export async function findOrCreateApprover(
  db: Db,
  args: {
    userId: string
    name: string
    email?: string | null
    phone?: string | null
    role?: string
    notes?: string | null
  },
): Promise<typeof schema.approver.$inferSelect> {
  const email = args.email?.trim().toLowerCase() || null
  const phone = args.phone?.trim() || null

  if (phone) {
    const [byPhone] = await db
      .select()
      .from(schema.approver)
      .where(and(eq(schema.approver.userId, args.userId), eq(schema.approver.phone, phone)))
      .limit(1)
    if (byPhone) return byPhone
  }
  if (email) {
    const [byEmail] = await db
      .select()
      .from(schema.approver)
      .where(and(eq(schema.approver.userId, args.userId), eq(schema.approver.email, email)))
      .limit(1)
    if (byEmail) return byEmail
  }

  const now = new Date()
  const [created] = await db
    .insert(schema.approver)
    .values({
      id: generateId(),
      userId: args.userId,
      name: args.name,
      email,
      phone,
      role: args.role ?? "client",
      magicToken: newMagicToken(),
      magicTokenIssuedAt: now,
      magicTokenExpiresAt: newMagicTokenExpiry(now),
      notes: args.notes ?? null,
    })
    .returning()
  return created
}

/**
 * Issue a fresh magic token, invalidating the old one. UI nicety lives
 * in /approvers; the actual revocation happens here. We don't keep a
 * history of old tokens — once rotated, the previous URL returns 404
 * from /a/[token] because lookupApproverByToken won't find it.
 */
export async function regenerateMagicToken(
  db: Db,
  approverId: string,
): Promise<{ approver: typeof schema.approver.$inferSelect; newToken: string }> {
  const newToken = newMagicToken()
  const now = new Date()
  const [updated] = await db
    .update(schema.approver)
    .set({
      magicToken: newToken,
      magicTokenIssuedAt: now,
      magicTokenExpiresAt: newMagicTokenExpiry(now),
      updatedAt: now,
    })
    .where(eq(schema.approver.id, approverId))
    .returning()
  return { approver: updated, newToken }
}

/**
 * Token lookup for /a/[token] portal. Returns the approver row or null
 * if the token is unknown (rotated, fabricated, or never existed).
 */
export async function lookupApproverByToken(
  db: Db,
  token: string,
): Promise<typeof schema.approver.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(schema.approver)
    .where(eq(schema.approver.magicToken, token))
    .limit(1)
  if (!row) return null
  if (isMagicTokenExpired(row.magicTokenExpiresAt)) return null
  return row
}

/** Normalize a phone string to digits-only for cross-source matching.
 *  Notion contact phones and approver.phone come from independent
 *  sources; we compare on digits so "+5511987654321" matches
 *  "55 11 98765 4321" matches "(11) 98765-4321". */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ""
  return phone.replace(/\D/g, "")
}

/**
 * Look up an approver by phone within an agency owner's scope. Used by
 * the post-approval cron to link `approvalLink.approverId` automatically:
 * when the Notion-resolved contact has a phone that matches an existing
 * approver row, that approver's magic-link portal will also surface this
 * post. No match → approverId stays null and the post-only WhatsApp flow
 * runs as before.
 */
export async function findApproverByPhone(
  db: Db,
  userId: string,
  phone: string | null | undefined,
): Promise<typeof schema.approver.$inferSelect | null> {
  const digits = normalizePhone(phone)
  if (digits.length < 8) return null  // implausibly short, skip
  const rows = await db
    .select()
    .from(schema.approver)
    .where(eq(schema.approver.userId, userId))
  // Match on normalized digits — approver.phone may also include +/spaces.
  for (const r of rows as Array<typeof schema.approver.$inferSelect>) {
    if (normalizePhone(r.phone) === digits) return r
  }
  return null
}

// ─── Pending items for the magic portal ────────────────────

export type PendingItem = {
  approvalLinkToken: string
  productionId: string | null
  productionTitle: string
  clientName: string | null
  stepOrder: number
  totalSteps: number
  round: number
  sentAt: Date | null
  expiresAt: Date
  // Names of approvers who already approved in this round (for "João Silva
  // já aprovou ✓" hints in the UI).
  previousApprovers: Array<{ name: string; approvedAt: Date }>
}

/**
 * For the /a/[token] portal: list every pending production-script
 * approval where this approver is the active step right now. Joins
 * approvalLink → production → client → productionApprover so the UI
 * can render context-rich rows without a second round-trip.
 *
 * Excludes:
 *   - approvalLinks for kind='post' (this portal is production-only)
 *   - rows whose approver chain step is NOT the current pending step
 *     (i.e., we somehow have a leftover row for an already-finished step)
 *   - expired rows (expiresAt < now)
 */
export async function listApproverPendingItems(
  db: Db,
  approverId: string,
): Promise<PendingItem[]> {
  const now = new Date()

  // Pull pending approvalLinks for this approver. Filter expired in JS
  // since drizzle's gt() has type quirks with timestamps from neon-http.
  const pending = await db
    .select({
      token: schema.approvalLink.token,
      productionId: schema.approvalLink.productionId,
      round: schema.approvalLink.round,
      sentAt: schema.approvalLink.sentAt,
      expiresAt: schema.approvalLink.expiresAt,
      clientId: schema.approvalLink.clientId,
    })
    .from(schema.approvalLink)
    .where(and(
      eq(schema.approvalLink.kind, "production_script"),
      eq(schema.approvalLink.approverId, approverId),
      isNull(schema.approvalLink.decision),
    ))
    .orderBy(desc(schema.approvalLink.createdAt))

  const live = pending.filter((p: { expiresAt: Date }) => p.expiresAt > now)
  if (live.length === 0) return []

  const productionIds: string[] = Array.from(new Set(
    live.map((p: { productionId: string | null }) => p.productionId).filter((id: string | null): id is string => !!id)
  ))
  if (productionIds.length === 0) return []

  const productions = await db
    .select({
      id: schema.production.id,
      title: schema.production.title,
      clientId: schema.production.clientId,
    })
    .from(schema.production)
    .where(inArray(schema.production.id, productionIds))

  const clientIds: string[] = (productions as Array<{ clientId: string }>).map((p) => p.clientId)
  const clients = await db
    .select({ id: schema.client.id, name: schema.client.name })
    .from(schema.client)
    .where(inArray(schema.client.id, clientIds))

  const stepRows = await db
    .select({
      productionId: schema.productionApprover.productionId,
      approverId: schema.productionApprover.approverId,
      stepOrder: schema.productionApprover.stepOrder,
    })
    .from(schema.productionApprover)
    .where(inArray(schema.productionApprover.productionId, productionIds))
    .orderBy(asc(schema.productionApprover.stepOrder))

  // For "previous approvers in this round" hint.
  const approvedThisRound = await db
    .select({
      productionId: schema.approvalLink.productionId,
      approverId: schema.approvalLink.approverId,
      decidedAt: schema.approvalLink.decidedAt,
      round: schema.approvalLink.round,
    })
    .from(schema.approvalLink)
    .where(and(
      eq(schema.approvalLink.kind, "production_script"),
      eq(schema.approvalLink.decision, "approved"),
      inArray(schema.approvalLink.productionId, productionIds),
    ))

  const allApproverIds: string[] = Array.from(new Set(
    (approvedThisRound as Array<{ approverId: string | null }>)
      .map((r) => r.approverId)
      .filter((id): id is string => !!id)
  ))
  const approverNames = allApproverIds.length > 0
    ? await db
        .select({ id: schema.approver.id, name: schema.approver.name })
        .from(schema.approver)
        .where(inArray(schema.approver.id, allApproverIds))
    : []

  const productionById = new Map<string, { id: string; title: string; clientId: string }>(
    (productions as Array<{ id: string; title: string; clientId: string }>).map((p) => [p.id, p])
  )
  const clientById = new Map<string, { id: string; name: string }>(
    (clients as Array<{ id: string; name: string }>).map((c) => [c.id, c])
  )
  const approverNameById = new Map<string, string>(
    (approverNames as Array<{ id: string; name: string }>).map((a) => [a.id, a.name])
  )

  return live.map((p: { token: string; productionId: string | null; round: number; sentAt: Date | null; expiresAt: Date; clientId: string }) => {
    const production = p.productionId ? productionById.get(p.productionId) : undefined
    const productionSteps = (stepRows as Array<{ productionId: string; approverId: string; stepOrder: number }>)
      .filter((s) => s.productionId === p.productionId)
      .sort((a, b) => a.stepOrder - b.stepOrder)
    const myStep = productionSteps.find((s) => s.approverId === approverId)?.stepOrder ?? 1

    const previousApprovers = (approvedThisRound as Array<{ productionId: string | null; round: number; approverId: string | null; decidedAt: Date | null }>)
      .filter((r) => r.productionId === p.productionId && r.round === p.round)
      .map((r) => ({
        name: r.approverId ? approverNameById.get(r.approverId) ?? "" : "",
        approvedAt: r.decidedAt ?? new Date(),
      }))
      .filter((entry) => entry.name)

    return {
      approvalLinkToken: p.token,
      productionId: p.productionId,
      productionTitle: production?.title ?? "Sem título",
      clientName: production ? clientById.get(production.clientId)?.name ?? null : null,
      stepOrder: myStep,
      totalSteps: productionSteps.length,
      round: p.round,
      sentAt: p.sentAt,
      expiresAt: p.expiresAt,
      previousApprovers,
    }
  })
}
