import { db } from "@/lib/db"
import { approvalLink, client as clientTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { generateId } from "@/lib/utils"

// Approval-link helpers shared by:
//   - the cron sweep in trigger/publish.ts (creates per-post tokens and
//     dispatches via ManyChat)
//   - the public approval API in app/api/approve/[token]/route.ts (the
//     client decides on /approve/{token})
//   - the public client-calendar API in app/api/c/[token]/route.ts (the
//     client browses all their posts on /c/{client-token})
//
// Two distinct token types:
//   1. approvalLink.token — short-lived (14d), per-post, single-use
//   2. client.publicCalendarToken — permanent, per-client, never expires
//      Generated lazily on first request via getOrCreateClientCalendarToken.

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
 * decides what to render (page) or status to return (API). Centralized
 * so both the page (server-rendered) and the API agree. */
export async function lookupApprovalLink(token: string): Promise<LookupResult> {
  const [row] = await db
    .select()
    .from(approvalLink)
    .where(eq(approvalLink.token, token))

  if (!row) return { kind: "not_found" }
  if (row.decision !== null) return { kind: "decided", row }
  if (isApprovalExpired(row.expiresAt)) return { kind: "expired", row }
  return { kind: "ok", row }
}
