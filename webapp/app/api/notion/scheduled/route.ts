import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection, fieldMapping, instagramAccount, publishLog, approvalLink } from "@/lib/db/schema"
import { eq, and, gte, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { getActiveClientScope, listAccessibleClients } from "@/lib/active-client"

type TargetCheck = { raw: string; platform: string; tipo: string; configured: boolean; pageName?: string | null }

const PAST_WINDOW_DAYS = 90

// Levenshtein distance — used to suggest "did you mean X?" when a Notion
// post's `conta` doesn't match any connected account exactly. Small (~20
// lines) so worth inlining vs. pulling a dep.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const dp = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}

function suggestMatch(needle: string, haystack: string[]): string | null {
  if (!needle || !haystack.length) return null
  const lower = needle.toLowerCase().trim()
  let best: { name: string; dist: number } | null = null
  for (const h of haystack) {
    const dist = levenshtein(lower, h.toLowerCase().trim())
    if (best === null || dist < best.dist) best = { name: h, dist }
  }
  // Tolerate up to 30% character difference. "naydacury" → "Naydacury" passes;
  // "vitamina" → "comparacar" doesn't.
  if (best && best.dist <= Math.max(2, Math.floor(needle.length * 0.3))) return best.name
  return null
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const scope = await getActiveClientScope(session.user.id)
  const isAgency = scope.mode === "all"
  // Resolve into a flat list of clients we'll filter against. Doing this
  // inside the discriminated-union branches lets TypeScript narrow `scope`.
  const allowedClients = scope.mode === "all" ? scope.clients : [scope.client]
  const clientIds = allowedClients.map((c) => c.id)
  const clientById = new Map(allowedClients.map((c) => [c.id, c] as const))

  const filterByClient = isAgency
    ? inArray(notionConnection.clientId, clientIds)
    : eq(notionConnection.clientId, clientIds[0])
  const filterAccounts = isAgency
    ? inArray(instagramAccount.clientId, clientIds)
    : eq(instagramAccount.clientId, clientIds[0])

  const [connections, accounts] = await Promise.all([
    db.select().from(notionConnection).where(filterByClient),
    db.select().from(instagramAccount).where(filterAccounts),
  ])

  const configured = connections.filter((c) => c.databaseId)

  // In single mode, accountMap groups all accounts (one client). In agency
  // mode we still want a flat platform:conta lookup but it's now scoped
  // across clients — if the same conta exists in two clients the post will
  // match whichever was inserted first; that's acceptable since accounts
  // are already unique per client in real data.
  const accountMap = new Map(
    accounts.filter((a) => a.active).map((a) => [`${a.platform.toLowerCase()}:${a.conta.toLowerCase()}`, a])
  )

  // ── Cross-tenant ownership routing ──────────────────────────
  // A Notion post's "owner" is the accessible client whose name OR
  // notionContaValues match the post's `conta` field. The post is
  // visible in the current view ONLY when its owner is in scope.
  // Resolution order (strongest signal wins):
  //   1. Client whose `name` matches `conta` (case-insensitive trim).
  //   2. Client that explicitly lists `conta` in `notionContaValues`.
  //   3. No owner → fall through to legacy IG-account name match below.
  //
  // Why name-match takes priority: a misconfigured notionContaValues
  // (e.g. agency adds "ComparaCar" to Vitamina's claimed contas by
  // mistake) used to leak posts cross-tenant because the previous
  // logic did "first writer wins" by iteration order. Name-match
  // pins the post to the obvious owner regardless of accidental
  // claims elsewhere.
  const allAccessible = await listAccessibleClients(session.user.id)
  function findExplicitOwner(contaKey: string): string | null {
    if (!contaKey) return null
    // Single source of truth: notionContaValues (#91). Name-based
    // matching removed — agency claims contas explicitly in /settings.
    for (const c of allAccessible) {
      const claims = c.notionContaValues ?? []
      if (claims.some((v) => v.trim().toLowerCase() === contaKey)) return c.id
    }
    return null
  }

  // Conta values that the legacy fallback considers "ours" when no
  // accessible client has explicit ownership. ONLY active in-scope
  // IG-account contas count — we intentionally don't union with
  // notionContaValues here so a misconfigured claim on the current
  // client can't override the explicit-owner check above.
  const clientContas = new Set<string>()
  for (const a of accounts) {
    if (a.active) clientContas.add(a.conta.toLowerCase())
  }
  const clientIdSet = new Set(clientIds)

  // ─── Upcoming (Notion) ────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""
  let upcoming: any[] = []
  let ignored: Array<{ pageId: string; title: string; conta: string; clientName: string | null; suggestion: string | null }> = []
  if (configured.length) {
    const allPosts = await Promise.allSettled(
      configured.map(async (connection) => {
        const [mappingRow] = await db
          .select()
          .from(fieldMapping)
          .where(eq(fieldMapping.connectionId, connection.id))

        const mapping = mappingRow ?? DEFAULT_MAPPING
        const notion = createNotionClient(connection.accessToken)

        // Fetch ready-to-publish posts and (if configured) awaiting-approval
        // posts in parallel. Awaiting posts surface in the same upcoming list
        // tagged with workflowState="awaiting" so the UI can render an
        // approval banner instead of a "publish now" CTA.
        const [readyPosts, awaitingPosts] = await Promise.all([
          notion.getScheduledPosts(connection.databaseId!, mapping),
          mapping.awaitingApprovalValue
            ? notion.getPostsByStatus(connection.databaseId!, mapping, mapping.awaitingApprovalValue).catch(() => [])
            : Promise.resolve([]),
        ])

        // Write the back-link URL to Notion's "Social VP" field for any post
        // whose stored value differs from the expected one. Fire-and-forget so
        // it doesn't block the response.
        if (appUrl && mapping.socialVpField) {
          for (const p of [...readyPosts, ...awaitingPosts]) {
            const expected = `${appUrl}/scheduled?postId=${p.pageId}`
            if (p.socialVpUrl !== expected) {
              notion.setSocialVpUrl(p.pageId, mapping, expected).catch(() => {})
            }
          }
        }

        const owningClient = clientById.get(connection.clientId ?? "")
        const shape = (p: typeof readyPosts[number], workflowState: "ready" | "awaiting") => {
          const targetChecks: TargetCheck[] = p.publishTargets.map((t) => {
            const key = `${t.platform}:${p.conta?.toLowerCase() ?? ""}`
            const account = accountMap.get(key)
            return {
              raw: t.raw,
              platform: t.platform,
              tipo: t.tipo,
              configured: !!account,
              pageName: account?.pageName ?? null,
            }
          })
          const contaKey = p.conta?.toLowerCase() ?? ""
          const contaConnected = contaKey ? accounts.some((a) => a.active && a.conta.toLowerCase() === contaKey) : false
          // Ownership routing:
          //  - findExplicitOwner returns the client whose name matches
          //    the conta, OR a client that explicitly claims it in
          //    notionContaValues. Name match always wins.
          //  - If an owner is found and is NOT in the current scope,
          //    the post belongs to a sibling client → hide.
          //  - If no owner is found, fall back to: does THIS client
          //    have an active IG account named `conta`? (strict, no
          //    notionContaValues fallback to avoid misconfig leaks.)
          let belongsToClient: boolean
          const explicitOwnerId = findExplicitOwner(contaKey)
          if (explicitOwnerId) {
            belongsToClient = clientIdSet.has(explicitOwnerId)
          } else {
            belongsToClient = !!contaKey && clientContas.has(contaKey)
          }
          return {
            kind: "upcoming" as const,
            ...p,
            workflowState,
            workspaceName: connection.workspaceName,
            connectionId: connection.id,
            clientId: connection.clientId,
            clientName: owningClient?.name ?? null,
            clientLogoUrl: owningClient?.logoUrl ?? null,
            targetChecks,
            belongsToClient,
            // Tag posts owned by ANOTHER accessible client (the agency
            // user can switch to that client to see them). Used to
            // exclude them from the "ignorados" pile — those should
            // only contain posts whose conta has no owner at all
            // (real misconfig), not posts that simply live elsewhere.
            ownedByOtherClient: explicitOwnerId != null && !clientIdSet.has(explicitOwnerId),
            contaConnected,
          }
        }
        return [
          ...readyPosts.map((p) => shape(p, "ready")),
          ...awaitingPosts.map((p) => shape(p, "awaiting")),
        ]
      })
    )

    const flat = allPosts
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
      .flatMap((r) => r.value)
    // Hide posts whose `conta` is unknown to this view's accounts. They can't
    // publish from here anyway, so showing them creates a fake "limbo".
    upcoming = flat
      .filter((p) => p.belongsToClient)
      .sort((a, b) => {
        if (!a.scheduledDate) return 1
        if (!b.scheduledDate) return -1
        return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
      })

    // Capture posts that would have shown but were filtered out — surface
    // them in the UI as "ignorados" with a fuzzy-match suggestion. Helps
    // users catch typo/case mismatches that silently kill publishing.
    // Only relevant in agency mode (when the user views the union of all
    // accessible clients). Inside a single client's scope, the user just
    // wants to see their own posts — orphan-conta noise belongs to the
    // agency oversight view.
    ignored = isAgency
      ? flat
        .filter((p) => !p.belongsToClient && p.conta && !p.ownedByOtherClient)
        .map((p) => ({
          pageId: p.pageId,
          title: p.title,
          conta: p.conta,
          clientName: p.clientName ?? null,
          suggestion: suggestMatch(p.conta, accounts.filter((a) => a.active).map((a) => a.conta)),
        }))
      : []

    // Merge approval-link state into each upcoming post. We pull the most
    // recent row per notionPageId scoped to the user's accessible clients
    // and tag each post with { state, decision, token, sentVia, ... }. UI
    // uses this to render a banner ("Aguardando há 2d", "Aprovado há 4h",
    // "Reenviar WhatsApp") and to filter the new "Aprovação" chip.
    const pageIds = upcoming.map((p) => p.pageId)
    if (pageIds.length) {
      const links = await db
        .select()
        .from(approvalLink)
        .where(and(
          inArray(approvalLink.notionPageId, pageIds),
          isAgency
            ? inArray(approvalLink.clientId, clientIds)
            : eq(approvalLink.clientId, clientIds[0]),
        ))

      // Pick the most recent row per page (a previously-decided link could
      // co-exist with a fresh pending one if the agency reopened the cycle).
      const linkByPage = new Map<string, typeof links[number]>()
      for (const row of links) {
        const existing = linkByPage.get(row.notionPageId)
        if (!existing || new Date(row.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
          linkByPage.set(row.notionPageId, row)
        }
      }

      const STALE_MS = 3 * 24 * 60 * 60 * 1000
      const now = Date.now()
      upcoming = upcoming.map((p) => {
        const link = linkByPage.get(p.pageId)
        if (!link) {
          // Awaiting-approval status with NO link row → cron hasn't run yet
          // or contact resolution failed. UI surfaces this as a soft warning.
          return { ...p, approval: p.workflowState === "awaiting" ? { state: "no_link" as const } : null }
        }
        const expiresMs = new Date(link.expiresAt).getTime()
        const sentMs = link.sentAt ? new Date(link.sentAt).getTime() : new Date(link.createdAt).getTime()
        let state: "pending" | "stale" | "decided" | "expired"
        // decision='expired' is the cron's synthetic marker for aged-out
        // pending links — surface as expired, not as a real decision.
        if (link.decision === "expired") state = "expired"
        else if (link.decision !== null) state = "decided"
        else if (expiresMs <= now) state = "expired"
        else if (now - sentMs > STALE_MS) state = "stale"
        else state = "pending"

        // Pull the owning client's manual WA template so the /scheduled
        // "Enviar via WA" button can render it without a second round-trip.
        const owning = clientById.get(p.clientId ?? "")

        return {
          ...p,
          approval: {
            state,
            token: link.token,
            decision: link.decision,
            comment: link.comment,
            sentVia: link.sentVia,
            sentAt: link.sentAt,
            decidedAt: link.decidedAt,
            expiresAt: link.expiresAt,
            contactName: link.contactName,
            contactPhone: link.contactPhone,
            lastError: link.lastError ?? null,
            approvalUrl: appUrl ? `${appUrl}/approve/${link.token}` : null,
            manualWaTemplate: owning?.manualWhatsappTemplate ?? null,
            ownerClientName: owning?.name ?? null,
          },
        }
      })
    }
  }

  // ─── Past (publishLog) ────────────────────────────────────────────────
  // publish_log.clientId is the CONNECTION's clientId at publish time, not
  // the post's conta-owner. When a single Notion connection serves multiple
  // agency clients (one DB hosts posts for several brands), all rows land
  // under the connection's owner regardless of which brand actually owned
  // each post. We re-apply the same conta-ownership routing as the upcoming
  // side: a past row only belongs to the current view if its conta resolves
  // to an in-scope client (name match or notionContaValues), or if no
  // owner is found AND the conta matches an in-scope IG account.
  const cutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const accessibleIdSet = new Set(allAccessible.map((c) => c.id))
  // Fetch from any accessible client's connection, then filter post-hoc by
  // conta-ownership. This is wider than the previous strict clientId filter,
  // but the conta filter narrows it back to the right scope and (critically)
  // doesn't drop posts that were misattributed at publish time.
  const logs = await db
    .select()
    .from(publishLog)
    .where(
      and(
        gte(publishLog.publishedAt, cutoff),
        inArray(publishLog.clientId, Array.from(accessibleIdSet)),
      )
    )

  // Group log rows by notionPageId so one Notion post = one past entry
  // even when it published to several platforms. Within each group, also
  // dedupe by platform raw — multiple retries on the same platform would
  // otherwise produce N badges of "Youtube — ignorado". Keep the best
  // status per platform (published > skipped > failed), and within ties
  // prefer the most recent log row.
  const statusRank = (s: string) => (s === "published" ? 3 : s === "skipped" ? 2 : 1)
  const grouped = new Map<string, any>()
  for (const log of logs) {
    const key = log.notionPageId
    let entry = grouped.get(key)
    if (!entry) {
      const owning = log.clientId ? clientById.get(log.clientId) : null
      entry = {
        kind: "past",
        pageId: log.notionPageId,
        title: log.postTitle,
        conta: log.conta,
        date: log.publishedAt,
        connectionId: log.connectionId,
        clientId: log.clientId,
        clientName: owning?.name ?? null,
        clientLogoUrl: owning?.logoUrl ?? null,
        belongsToClient: true,
        // Map<platformRaw, platformBadge> — flattened to .platforms below.
        _platformsByRaw: new Map<string, any>(),
      }
      grouped.set(key, entry)
    }
    const raw = log.platform ?? "—"
    const candidate = {
      raw,
      status: log.status,
      error: log.error,
      postId: log.platformPostId ?? log.instagramPostId,
      logId: log.id,
      publishedAt: log.publishedAt,
    }
    const existing = entry._platformsByRaw.get(raw)
    const rankCmp = statusRank(candidate.status) - statusRank(existing?.status ?? "")
    const recencyCmp = existing
      ? new Date(candidate.publishedAt).getTime() - new Date(existing.publishedAt).getTime()
      : 1
    if (!existing || rankCmp > 0 || (rankCmp === 0 && recencyCmp > 0)) {
      entry._platformsByRaw.set(raw, candidate)
    }
    // Use the earliest publishedAt for the group's date
    if (new Date(log.publishedAt) < new Date(entry.date)) entry.date = log.publishedAt
  }

  const past = Array.from(grouped.values())
    .filter((entry) => {
      // Apply the same conta-ownership routing as the upcoming side. A
      // past row whose conta resolves to a sibling client (or to a
      // client outside the current view) is excluded — this is the
      // mirror of belongsToClient on the upcoming branch.
      const contaKey = (entry.conta ?? "").toLowerCase()
      const explicitOwnerId = findExplicitOwner(contaKey)
      if (explicitOwnerId) return clientIdSet.has(explicitOwnerId)
      if (!contaKey) {
        // No conta on the log row → fall back to publish-time clientId.
        return entry.clientId ? clientIdSet.has(entry.clientId) : false
      }
      return clientContas.has(contaKey)
    })
    .map((entry) => {
      const platforms = Array.from(entry._platformsByRaw.values()).map((p: any) => ({
        raw: p.raw,
        status: p.status,
        error: p.error,
        postId: p.postId,
        logId: p.logId,
      }))
      const { _platformsByRaw, ...rest } = entry
      return { ...rest, platforms }
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Breakdown of upcoming posts by their Notion status value. Lets
  // the UI render a chip strip "Status produção: Briefing (3) ·
  // Aguardando aprovação (5) · Em revisão (2) · …" with quick filter
  // by clicking a status. Empty statuses excluded.
  const statusCounts = new Map<string, number>()
  for (const p of upcoming) {
    const s = (p.notionStatus ?? "").trim()
    if (!s) continue
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1)
  }
  const statusBreakdown = Array.from(statusCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    upcoming,
    past,
    ignored,
    statusBreakdown,
    // Backward-compat: existing /scheduled callers that read `posts` keep working.
    posts: upcoming,
    configured: configured.length > 0,
    agencyMode: isAgency,
    // Light client roster so the UI can render a per-client legend without
    // a second round-trip.
    clients: allowedClients.map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl })),
  })
}
