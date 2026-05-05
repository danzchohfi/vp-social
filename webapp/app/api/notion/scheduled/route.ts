import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection, fieldMapping, instagramAccount, publishLog } from "@/lib/db/schema"
import { eq, and, gte, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { getActiveClientScope } from "@/lib/active-client"

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
  const clientContas = new Set(accounts.filter((a) => a.active).map((a) => a.conta.toLowerCase()))

  // ─── Upcoming (Notion) ───────────────────────────────────────────
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
        const posts = await notion.getScheduledPosts(connection.databaseId!, mapping)

        // Write the back-link URL to Notion's "Social VP" field for any post
        // whose stored value differs from the expected one. Fire-and-forget so
        // it doesn't block the response.
        if (appUrl && mapping.socialVpField) {
          for (const p of posts) {
            const expected = `${appUrl}/scheduled?postId=${p.pageId}`
            if (p.socialVpUrl !== expected) {
              notion.setSocialVpUrl(p.pageId, mapping, expected).catch(() => {})
            }
          }
        }

        const owningClient = clientById.get(connection.clientId ?? "")
        return posts.map((p) => {
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
          // True when the post's `conta` matches an active account in (single
          // mode) the active client or (agency mode) any accessible client.
          // Posts where this is false are filtered out below — they belong to
          // contas the user hasn't connected here, and would just clutter
          // /scheduled with stuff that isn't going to publish from this view.
          const belongsToClient = !!contaKey && clientContas.has(contaKey)
          return {
            kind: "upcoming",
            ...p,
            workspaceName: connection.workspaceName,
            connectionId: connection.id,
            clientId: connection.clientId,
            clientName: owningClient?.name ?? null,
            clientLogoUrl: owningClient?.logoUrl ?? null,
            targetChecks,
            belongsToClient,
            contaConnected,
          }
        })
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
    ignored = flat
      .filter((p) => !p.belongsToClient && p.conta)
      .map((p) => ({
        pageId: p.pageId,
        title: p.title,
        conta: p.conta,
        clientName: p.clientName ?? null,
        suggestion: suggestMatch(p.conta, accounts.filter((a) => a.active).map((a) => a.conta)),
      }))
  }

  // ─── Past (publishLog) ────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const logs = await db
    .select()
    .from(publishLog)
    .where(
      and(
        eq(publishLog.userId, session.user.id),
        gte(publishLog.publishedAt, cutoff),
        isAgency
          ? inArray(publishLog.clientId, clientIds)
          : eq(publishLog.clientId, clientIds[0])
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

  return NextResponse.json({
    upcoming,
    past,
    ignored,
    // Backward-compat: existing /scheduled callers that read `posts` keep working.
    posts: upcoming,
    configured: configured.length > 0,
    agencyMode: isAgency,
    // Light client roster so the UI can render a per-client legend without
    // a second round-trip.
    clients: allowedClients.map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl })),
  })
}
