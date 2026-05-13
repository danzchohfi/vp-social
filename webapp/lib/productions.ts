/**
 * Productions module — domain layer for the brief → script → approval →
 * recording → editing → delivered → published lifecycle. Pairs with
 * lib/approvers.ts (chain participants) and the API in app/api/productions/.
 *
 * No DB queries here beyond what's needed for the chain helpers; CRUD
 * lives in the API routes. This file is the source of truth for the
 * status state machine and the multi-step approval logic.
 */

import { and, asc, desc, eq, isNull, max } from "drizzle-orm"
import * as schema from "./db/schema"
import { generateId } from "./utils"

// ─── Status state machine ──────────────────────────────

export const PRODUCTION_STATUSES = [
  "brief_pending",
  "script_drafting",
  "awaiting_approval",
  "revision_requested",
  "approved",
  "recording",
  "editing",
  "delivered",
  "published",
  "archived",
] as const

export type ProductionStatus = typeof PRODUCTION_STATUSES[number]

/** Human-readable Portuguese label for each status (used by UI + emails). */
export const STATUS_LABEL_PT: Record<ProductionStatus, string> = {
  brief_pending: "Brief pendente",
  script_drafting: "Roteiro em elaboração",
  awaiting_approval: "Aguardando aprovação",
  revision_requested: "Pedido de alteração",
  approved: "Roteiro aprovado",
  recording: "Em gravação",
  editing: "Em edição",
  delivered: "Entregue",
  published: "Publicado",
  archived: "Arquivado",
}

/**
 * Who can move a production from `from` to `to`. Three roles model the
 * permission boundary:
 *
 *   - "agency": owner or any clientMember of the production's client. They
 *     drive the script lifecycle and can override anything (emergency exit).
 *   - "client": end-client interacting via /c/[token] or /approve/[token].
 *     They only fill briefs and approve/reject — never advance the
 *     editing/delivered phases.
 *   - "system": the cron / approval webhook. Used for chain-driven
 *     transitions (e.g., last approver decides → 'approved') so the helper
 *     can run them without a human role check.
 *
 * Empty array = no transition allowed for this role from this status.
 */
type Role = "agency" | "client" | "system"

const TRANSITIONS: Record<Role, Partial<Record<ProductionStatus, ProductionStatus[]>>> = {
  agency: {
    brief_pending: ["script_drafting", "archived"],
    script_drafting: ["awaiting_approval", "brief_pending", "archived"],
    // Emergency: agency can yank a production back to drafting if the
    // client is unresponsive, or force-approve via "external" sentVia
    // (Wave 3). Bypass exists because real-world workflows leak: client
    // approves on the phone, agency wants the system to reflect that.
    awaiting_approval: ["script_drafting", "revision_requested", "approved", "archived"],
    revision_requested: ["script_drafting", "archived"],
    approved: ["recording", "script_drafting", "archived"],
    recording: ["editing", "approved", "archived"],
    editing: ["delivered", "recording", "archived"],
    delivered: ["published", "editing", "archived"],
    published: ["archived"],
    archived: ["script_drafting"],
  },
  client: {
    // Brief flow: client fills brief, app advances to drafting.
    brief_pending: ["script_drafting"],
    // Script approval flow: from the /approve/[token] page, the public
    // POST handler issues a 'system' transition (see TRANSITIONS.system)
    // — clients don't drive the status directly. Listed here as empty
    // for clarity.
  },
  system: {
    // Triggered by /api/approve/[token] decisions and by advanceChain.
    awaiting_approval: ["awaiting_approval", "revision_requested", "approved"],
    revision_requested: ["awaiting_approval", "script_drafting"],
  },
}

export function canTransition(from: ProductionStatus, to: ProductionStatus, role: Role): boolean {
  if (from === to) return true
  return TRANSITIONS[role]?.[from]?.includes(to) ?? false
}

// ─── Production summary (for list views) ──────────────────

export type ProductionSummary = {
  id: string
  title: string
  type: string
  status: ProductionStatus
  statusLabel: string
  specialistName: string | null
  recordingDate: Date | null
  deliveryDate: Date | null
  publishDate: Date | null
  updatedAt: Date
}

export function summarizeProduction(p: typeof schema.production.$inferSelect): ProductionSummary {
  return {
    id: p.id,
    title: p.title,
    type: p.type,
    status: p.status as ProductionStatus,
    statusLabel: STATUS_LABEL_PT[p.status as ProductionStatus] ?? p.status,
    specialistName: p.specialistName,
    recordingDate: p.recordingDate,
    deliveryDate: p.deliveryDate,
    publishDate: p.publishDate,
    updatedAt: p.updatedAt,
  }
}

// ─── Multi-step approval chain ──────────────────────────────
// The chain is driven by approvalLink rows joined to productionApprover.
// At any moment, ≤1 row per (production, approver, round) is pending.
// advanceChain creates the NEXT step's row after the current one approves.

type Db = any  // Drizzle type doesn't survive across the FK boundary cleanly; caller passes db.

/**
 * Find the currently-pending step for a production, if any. Returns the
 * approvalLink row joined with the approverId/stepOrder/round so callers
 * can render "Aprovação 2 de 3 — Round 1" in the UI.
 *
 * Returns null when the production has no pending approval (either no
 * chain configured, or all steps decided, or status outside the approval
 * phase).
 */
export async function getActiveStep(db: Db, productionId: string): Promise<
  | {
      approvalLinkId: string
      approverId: string
      stepOrder: number
      round: number
      totalSteps: number
    }
  | null
> {
  const [link] = await db
    .select({
      id: schema.approvalLink.id,
      approverId: schema.approvalLink.approverId,
      round: schema.approvalLink.round,
    })
    .from(schema.approvalLink)
    .where(and(
      eq(schema.approvalLink.kind, "production_script"),
      eq(schema.approvalLink.productionId, productionId),
      isNull(schema.approvalLink.decision),
    ))
    .orderBy(desc(schema.approvalLink.createdAt))
    .limit(1)

  if (!link || !link.approverId) return null

  const stepRows = await db
    .select({ stepOrder: schema.productionApprover.stepOrder, approverId: schema.productionApprover.approverId })
    .from(schema.productionApprover)
    .where(eq(schema.productionApprover.productionId, productionId))
    .orderBy(asc(schema.productionApprover.stepOrder))

  const currentStep = stepRows.find((s: { approverId: string }) => s.approverId === link.approverId)?.stepOrder ?? 1

  return {
    approvalLinkId: link.id,
    approverId: link.approverId,
    stepOrder: currentStep,
    round: link.round,
    totalSteps: stepRows.length,
  }
}

/**
 * After step K approves, dispatch step K+1 (or finish the chain). Returns
 * a discriminated result the caller (the /approve POST handler) uses to
 * decide whether to flip production status to 'approved'.
 *
 *   - { kind: "next", approvalLink, approver }: caller should send
 *     WhatsApp to the next approver with the new approvalLink token.
 *   - { kind: "complete" }: chain finished, caller flips the production
 *     status to 'approved'.
 *   - { kind: "no_chain" }: production has no chain configured. Treat
 *     same as 'complete' for status-flipping; UI may surface a warning.
 *
 * Idempotent: rerunning after the next link is already created returns
 * the existing row without creating a duplicate (relies on the partial
 * unique index pendingProductionUniq).
 */
export async function advanceChain(
  db: Db,
  productionId: string,
  currentRound: number,
): Promise<
  | { kind: "next"; approvalLinkRow: typeof schema.approvalLink.$inferSelect; approver: typeof schema.approver.$inferSelect; stepOrder: number; totalSteps: number }
  | { kind: "complete" }
  | { kind: "no_chain" }
> {
  const stepRows = await db
    .select({
      approverId: schema.productionApprover.approverId,
      stepOrder: schema.productionApprover.stepOrder,
    })
    .from(schema.productionApprover)
    .where(eq(schema.productionApprover.productionId, productionId))
    .orderBy(asc(schema.productionApprover.stepOrder))

  if (stepRows.length === 0) return { kind: "no_chain" }

  // Find which steps have already approved in the current round.
  const approvedRows = await db
    .select({ approverId: schema.approvalLink.approverId })
    .from(schema.approvalLink)
    .where(and(
      eq(schema.approvalLink.kind, "production_script"),
      eq(schema.approvalLink.productionId, productionId),
      eq(schema.approvalLink.round, currentRound),
      eq(schema.approvalLink.decision, "approved"),
    ))
  const approvedIds = new Set(approvedRows.map((r: { approverId: string | null }) => r.approverId).filter(Boolean))

  // First step whose approver hasn't approved this round.
  const nextStep = stepRows.find((s: { approverId: string }) => !approvedIds.has(s.approverId))
  if (!nextStep) return { kind: "complete" }

  const [approver] = await db
    .select()
    .from(schema.approver)
    .where(eq(schema.approver.id, nextStep.approverId))
  if (!approver) return { kind: "complete" }

  // Idempotency: if a pending link for this approver/round already exists,
  // return it unchanged so callers don't double-dispatch WhatsApp.
  const [existing] = await db
    .select()
    .from(schema.approvalLink)
    .where(and(
      eq(schema.approvalLink.kind, "production_script"),
      eq(schema.approvalLink.productionId, productionId),
      eq(schema.approvalLink.approverId, nextStep.approverId),
      eq(schema.approvalLink.round, currentRound),
      isNull(schema.approvalLink.decision),
    ))
    .limit(1)
  if (existing) {
    return { kind: "next", approvalLinkRow: existing, approver, stepOrder: nextStep.stepOrder, totalSteps: stepRows.length }
  }

  // Caller is responsible for WhatsApp dispatch + setting sentVia after
  // we INSERT. We just create the row with sentVia='none' and let the
  // caller flip it on success. Same pattern as the post-approval cron.
  const [production] = await db
    .select({
      title: schema.production.title,
      clientId: schema.production.clientId,
    })
    .from(schema.production)
    .where(eq(schema.production.id, productionId))

  // production_script approvalLinks reuse the existing schema. Some
  // post-only fields are filler: connectionId is currently NOT NULL on the
  // table but irrelevant for productions; we set it to a sentinel pulled
  // from the production's client connections (first available) just to
  // satisfy the constraint. UI never reads connectionId for productions.
  const [conn] = await db
    .select({ id: schema.notionConnection.id })
    .from(schema.notionConnection)
    .where(eq(schema.notionConnection.clientId, production.clientId))
    .limit(1)

  const APPROVAL_TTL_DAYS = 14
  const token = generateId() + generateId().replace(/-/g, "")
  const newRow: typeof schema.approvalLink.$inferInsert = {
    id: generateId(),
    token,
    clientId: production.clientId,
    connectionId: conn?.id ?? "",
    notionPageId: "", // unused for productions
    postTitle: production.title,
    contactName: approver.name,
    contactEmail: approver.email,
    contactPhone: approver.phone,
    sentVia: "none",
    sentAt: null,
    expiresAt: new Date(Date.now() + APPROVAL_TTL_DAYS * 24 * 60 * 60 * 1000),
    kind: "production_script",
    productionId,
    approverId: nextStep.approverId,
    round: currentRound,
  }
  const [inserted] = await db
    .insert(schema.approvalLink)
    .values(newRow)
    .onConflictDoNothing()
    .returning()

  // If onConflictDoNothing swallowed the insert (race with another
  // advanceChain caller), fetch the row another worker just created.
  if (!inserted) {
    const [raced] = await db
      .select()
      .from(schema.approvalLink)
      .where(and(
        eq(schema.approvalLink.kind, "production_script"),
        eq(schema.approvalLink.productionId, productionId),
        eq(schema.approvalLink.approverId, nextStep.approverId),
        eq(schema.approvalLink.round, currentRound),
        isNull(schema.approvalLink.decision),
      ))
      .limit(1)
    return raced
      ? { kind: "next", approvalLinkRow: raced, approver, stepOrder: nextStep.stepOrder, totalSteps: stepRows.length }
      : { kind: "complete" }
  }

  return { kind: "next", approvalLinkRow: inserted, approver, stepOrder: nextStep.stepOrder, totalSteps: stepRows.length }
}

/**
 * Find the highest round used so far for a production, then return
 * `max + 1`. Called when the agency clicks "Reenviar para aprovação"
 * after a rejection — the new chain starts in a fresh round so the
 * unique index doesn't collide with the previous round's rejected rows.
 */
export async function bumpRound(db: Db, productionId: string): Promise<number> {
  const [row] = await db
    .select({ maxRound: max(schema.approvalLink.round) })
    .from(schema.approvalLink)
    .where(and(
      eq(schema.approvalLink.kind, "production_script"),
      eq(schema.approvalLink.productionId, productionId),
    ))
  const current = (row?.maxRound as number | null) ?? 0
  return current + 1
}
