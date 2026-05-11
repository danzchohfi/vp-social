import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { approvalLink, instagramAccount, publishLog } from "@/lib/db/schema"
import { and, desc, gte, inArray, isNotNull } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getActiveClientScope, listAccessibleClients } from "@/lib/active-client"

// Cross-client activity feed — single chronological stream of events
// the agency cares about: publishes (success + failure), approvals
// (created + decided). Used by /activity page to give the agency a
// "what happened while I was away" timeline without manually checking
// each /scheduled and /clients page.
//
// Scope: ALL accessible clients (not just current active). Returns
// events from the last 14 days, capped at `limit` (default 50).
//
// We don't materialize an `events` table — derive on read from existing
// publishLog + approvalLink rows. Avoids backfill + dual-write costs;
// the queries are fast at agency scale (typical: <1000 rows/14d).

export type ActivityEvent =
  | {
      kind: "published" | "failed"
      id: string
      timestamp: string
      clientId: string | null
      clientName: string | null
      postTitle: string
      conta: string | null
      platform: string | null
      error: string | null
      permalink: string | null
    }
  | {
      kind: "approval_decided"
      id: string
      timestamp: string
      clientId: string | null
      clientName: string | null
      postTitle: string
      contactName: string | null
      decision: "approved" | "changes_requested" | "expired" | string
      comment: string | null
      token: string
    }

const ALLOWED_DAYS = new Set([7, 14, 30])
const DEFAULT_DAYS = 14

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const limitParam = parseInt(url.searchParams.get("limit") ?? "50", 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 200 ? limitParam : 50
  const daysParam = parseInt(url.searchParams.get("days") ?? `${DEFAULT_DAYS}`, 10)
  const days = ALLOWED_DAYS.has(daysParam) ? daysParam : DEFAULT_DAYS
  // `kinds` accepts comma-separated values: publishes,approvals. Empty/missing
  // = both. Anything else falls back to both — easier than 400'ing the page.
  const kindsParam = (url.searchParams.get("kinds") ?? "").trim()
  const wantPublishes = kindsParam === "" || kindsParam.includes("publishes")
  const wantApprovals = kindsParam === "" || kindsParam.includes("approvals")

  const accessible = await listAccessibleClients(session.user.id)
  if (accessible.length === 0) {
    return NextResponse.json({ events: [], days, kinds: { publishes: wantPublishes, approvals: wantApprovals } })
  }
  const accessibleIds = accessible.map((c) => c.id)
  const clientNameById = new Map(accessible.map((c) => [c.id, c.name]))

  // Active scope: single client (single-client view) or all accessible
  // (agency view). The activity feed used to ignore this and always
  // return agency-wide — leaking sibling-client events into single-client
  // views. Now we mirror the /scheduled scoping semantics.
  const scope = await getActiveClientScope(session.user.id)
  const inScopeIds = new Set(
    scope.mode === "all" ? accessibleIds : [scope.client.id],
  )

  // Conta-ownership resolution — same logic as /api/notion/scheduled.
  // A publish_log row's `clientId` is the CONNECTION's owner at publish
  // time; the post may actually belong to a sibling client when one
  // Notion DB hosts multiple brands. Resolve by `conta` to label and
  // filter correctly.
  function findExplicitOwner(contaKey: string): string | null {
    if (!contaKey) return null
    const byName = accessible.find((c) => c.name.trim().toLowerCase() === contaKey)
    if (byName) return byName.id
    for (const c of accessible) {
      const claims = c.notionContaValues ?? []
      if (claims.some((v) => v.trim().toLowerCase() === contaKey)) return c.id
    }
    return null
  }
  // IG-account fallback per client — used when conta has no explicit
  // owner. Map from conta (lowercase) → clientId of the active account
  // that bears it.
  const igAccounts = await db
    .select({ clientId: instagramAccount.clientId, conta: instagramAccount.conta, active: instagramAccount.active })
    .from(instagramAccount)
    .where(inArray(instagramAccount.clientId, accessibleIds))
  const accountOwnerByConta = new Map<string, string>()
  for (const a of igAccounts) {
    if (!a.active || !a.clientId) continue
    const k = a.conta.trim().toLowerCase()
    if (k && !accountOwnerByConta.has(k)) accountOwnerByConta.set(k, a.clientId)
  }
  function resolveOwnerId(conta: string | null | undefined, fallbackClientId: string | null): string | null {
    const k = (conta ?? "").trim().toLowerCase()
    if (!k) return fallbackClientId
    const explicit = findExplicitOwner(k)
    if (explicit) return explicit
    const byAccount = accountOwnerByConta.get(k)
    if (byAccount) return byAccount
    return fallbackClientId
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  type LogRow = typeof publishLog.$inferSelect
  type LinkRow = typeof approvalLink.$inferSelect
  // Query widened to ALL accessible clients (not just inScopeIds): we'll
  // re-route each row by conta-ownership and then filter to in-scope.
  // A publish_log row recorded under Vitamina's connection but with
  // conta="ComparaCar" must be re-attributed to ComparaCar BEFORE the
  // scope check, otherwise we'd hide it from ComparaCar's view (wrong).
  const [logs, decided] = await Promise.all([
    wantPublishes
      ? db
          .select()
          .from(publishLog)
          .where(and(
            inArray(publishLog.clientId, accessibleIds),
            gte(publishLog.publishedAt, since),
          ))
          .orderBy(desc(publishLog.publishedAt))
          .limit(limit * 4) // overfetch — some rows will be filtered out by scope
      : Promise.resolve([] as LogRow[]),
    wantApprovals
      ? db
          .select()
          .from(approvalLink)
          .where(and(
            inArray(approvalLink.clientId, accessibleIds),
            gte(approvalLink.decidedAt, since),
            isNotNull(approvalLink.decidedAt),
          ))
          .orderBy(desc(approvalLink.decidedAt))
          .limit(limit * 4)
      : Promise.resolve([] as LinkRow[]),
  ])

  const events: ActivityEvent[] = []

  for (const log of logs) {
    if (log.status !== "published" && log.status !== "failed") continue
    const ownerId = resolveOwnerId(log.conta, log.clientId)
    if (!ownerId || !inScopeIds.has(ownerId)) continue
    events.push({
      kind: log.status,
      id: `log:${log.id}`,
      timestamp: log.publishedAt.toISOString(),
      clientId: ownerId,
      clientName: clientNameById.get(ownerId) ?? null,
      postTitle: log.postTitle,
      conta: log.conta,
      platform: log.platform,
      error: log.error,
      permalink: log.platformPostUrl,
    })
  }

  for (const link of decided) {
    if (!link.decidedAt) continue
    const decision = link.decision
    if (decision !== "approved" && decision !== "changes_requested" && decision !== "expired") continue
    // approvalLink doesn't store conta directly; we trust the stored
    // clientId here because the cron sets it from the post's resolved
    // owner at link-creation time. Still, scope-filter to in-scope only.
    if (!link.clientId || !inScopeIds.has(link.clientId)) continue
    events.push({
      kind: "approval_decided",
      id: `link:${link.id}`,
      timestamp: link.decidedAt.toISOString(),
      clientId: link.clientId,
      clientName: clientNameById.get(link.clientId) ?? null,
      postTitle: link.postTitle,
      contactName: link.contactName,
      decision,
      comment: link.comment,
      token: link.token,
    })
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return NextResponse.json({
    events: events.slice(0, limit),
    days,
    kinds: { publishes: wantPublishes, approvals: wantApprovals },
  })
}
