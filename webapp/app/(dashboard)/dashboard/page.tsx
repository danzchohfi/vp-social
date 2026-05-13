import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { approvalLink, fieldMapping, instagramAccount, notionConnection, publishLog } from "@/lib/db/schema"
import { eq, desc, count, inArray, and, gte, max, isNotNull } from "drizzle-orm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { Instagram, BookOpen, CheckCircle2, XCircle, Clock, Zap, ArrowRight, Facebook, Youtube, Linkedin, CalendarClock, LayoutGrid, Building2, AlertTriangle, MoonStar, ExternalLink, MessageCircle, ThumbsUp, Heart, Tag, Film, Image as ImageIcon } from "lucide-react"
import Link from "next/link"
import { PublishButton } from "@/components/dashboard/publish-button"
import { SwitchClientButton } from "@/components/dashboard/switch-client-button"
import { AgencyClientCard } from "@/components/dashboard/agency-client-card"
import { RecentActivityActions } from "@/components/dashboard/recent-activity-actions"
import { NotifyPendingButton } from "@/components/dashboard/notify-pending-button"
import { PendingDetailsButton } from "@/components/dashboard/pending-details-button"
import { DashboardPublishNow } from "@/components/dashboard/dashboard-publish-now"
import { getActiveClientScope, listAccessibleClients } from "@/lib/active-client"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping, type NotionPost } from "@/lib/notion"
import { cn } from "@/lib/utils"

// Inline issue computation for the next-publications widget. Lighter than
// /scheduled's postIssues (which has full targetChecks): we only know the
// post's conta is connected (otherwise it'd be filtered out earlier), and
// per-target account presence is computed against the dashboard's account
// list. Each issue carries a one-click fix link.
type DashboardPostIssue = {
  message: string
  actionLabel: string
  actionHref: string
  actionExternal?: boolean
}

function notionUrlFor(p: { pageId: string; notionUrl?: string | null }): string {
  return p.notionUrl || `https://www.notion.so/${p.pageId.replace(/-/g, "")}`
}

function computeNextPostIssues(
  post: NotionPost,
  accounts: Array<{ platform: string; conta: string; active: boolean }>,
): DashboardPostIssue[] {
  const issues: DashboardPostIssue[] = []
  if (!post.scheduledDate) {
    issues.push({
      message: "Sem data de publicação",
      actionLabel: "Definir no Notion",
      actionHref: notionUrlFor(post),
      actionExternal: true,
    })
  }
  if (!post.publishTargets.length) {
    issues.push({
      message: 'Campo "Publicar em" vazio',
      actionLabel: "Definir no Notion",
      actionHref: notionUrlFor(post),
      actionExternal: true,
    })
    return issues
  }
  const contaLower = (post.conta || "").toLowerCase()
  const missing: string[] = []
  for (const target of post.publishTargets) {
    const matched = accounts.some(
      (a) => a.active && a.platform === target.platform && a.conta.toLowerCase() === contaLower,
    )
    if (!matched) missing.push(target.raw)
  }
  if (missing.length === post.publishTargets.length) {
    issues.push({
      message: `Sem conta conectada para ${post.conta || "este post"}`,
      actionLabel: "Conectar conta",
      actionHref: "/accounts",
    })
  } else if (missing.length > 0) {
    issues.push({
      message: `Sem conta para: ${missing.join(", ")}`,
      actionLabel: "Conectar conta",
      actionHref: "/accounts",
    })
  }
  return issues
}

// Read-only fetch of upcoming posts from each connection. We fan out so a
// single slow Notion call doesn't block the others, and we cap the result
// to the soonest 5 across all connections to keep the dashboard snappy.
async function fetchUpcomingForConnections(
  conns: Array<{ id: string; databaseId: string | null; accessToken: string; clientId: string | null }>
): Promise<Array<NotionPost & { connectionId: string; clientId: string | null }>> {
  const ready = conns.filter((c) => c.databaseId)
  if (!ready.length) return []
  const results = await Promise.allSettled(
    ready.map(async (c) => {
      const [m] = await db.select().from(fieldMapping).where(eq(fieldMapping.connectionId, c.id))
      const mapping: FieldMapping = m ?? DEFAULT_MAPPING
      const notion = createNotionClient(c.accessToken)
      const posts = await notion.getScheduledPosts(c.databaseId!, mapping)
      return posts.map((p) => ({ ...p, connectionId: c.id, clientId: c.clientId }))
    })
  )
  const flat = results
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
    .flatMap((r) => r.value)
  return flat.sort((a, b) => {
    if (!a.scheduledDate) return 1
    if (!b.scheduledDate) return -1
    return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
  })
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session!.user.id

  const scope = await getActiveClientScope(userId)
  const isAgency = scope.mode === "all"
  // Resolve into a flat list of clients we'll filter against. Doing this
  // inside the discriminated-union branches lets TypeScript narrow `scope`.
  const allowedClients = scope.mode === "all" ? scope.clients : [scope.client]
  const clientIds = allowedClients.map((c) => c.id)
  const clientById = new Map(allowedClients.map((c) => [c.id, c] as const))

  const accountsFilter = isAgency
    ? inArray(instagramAccount.clientId, clientIds)
    : eq(instagramAccount.clientId, clientIds[0])
  const notionFilter = isAgency
    ? inArray(notionConnection.clientId, clientIds)
    : eq(notionConnection.clientId, clientIds[0])
  const logsFilter = isAgency
    ? inArray(publishLog.clientId, clientIds)
    : eq(publishLog.clientId, clientIds[0])

  const [accounts, notion, logs, stats, mappings] = await Promise.all([
    db.select().from(instagramAccount).where(accountsFilter),
    db.select().from(notionConnection).where(notionFilter),
    db.select().from(publishLog).where(logsFilter).orderBy(desc(publishLog.publishedAt)).limit(10),
    db
      .select({ status: publishLog.status, total: count() })
      .from(publishLog)
      .where(logsFilter)
      .groupBy(publishLog.status),
    // Mapping rows for these connections — used to drive the "Mapeamento ✓"
    // checklist item. If a row exists for any connection, count it as done.
    db
      .select({ connectionId: fieldMapping.connectionId })
      .from(fieldMapping)
      .innerJoin(notionConnection, eq(notionConnection.id, fieldMapping.connectionId))
      .where(notionFilter),
  ])

  // Best-effort upcoming-post count + next 5 list. Failures fall back to []
  // so a flaky Notion call doesn't break the dashboard.
  const upcomingRaw = await fetchUpcomingForConnections(notion).catch(() => [])
  // Mirror /api/notion/scheduled's conta-ownership routing so the dashboard
  // doesn't show ComparaCar posts in Vitamina view (etc.). Strongest signal
  // first: client name match → notionContaValues claim → IG account fallback.
  const allAccessible = await listAccessibleClients(userId)
  const clientIdSet = new Set(clientIds)
  function findExplicitOwner(contaKey: string): string | null {
    if (!contaKey) return null
    const byName = allAccessible.find((c) => c.name.trim().toLowerCase() === contaKey)
    if (byName) return byName.id
    for (const c of allAccessible) {
      const claims = c.notionContaValues ?? []
      if (claims.some((v) => v.trim().toLowerCase() === contaKey)) return c.id
    }
    return null
  }
  const clientContas = new Set(accounts.filter((a) => a.active).map((a) => a.conta.toLowerCase()))
  function postBelongsHere(conta: string | null | undefined): boolean {
    const k = (conta ?? "").trim().toLowerCase()
    if (!k) return false
    const ownerId = findExplicitOwner(k)
    if (ownerId) return clientIdSet.has(ownerId)
    return clientContas.has(k)
  }
  const upcoming = upcomingRaw.filter((p) => postBelongsHere(p.conta))
  const upcomingCount = upcoming.length
  const nextFive = upcoming.slice(0, 5)

  // Health check: posts whose conta doesn't resolve to ANY accessible
  // client. Surfaces upstream as a warning so the agency catches typos
  // or missing notionContaValues claims early. Counted by conta name +
  // sample post titles; we cap details at 5 to keep the dashboard tight.
  type UnmappedConta = { conta: string; count: number; samples: string[] }
  const unmappedContasMap = new Map<string, UnmappedConta>()
  for (const p of upcomingRaw) {
    const k = (p.conta ?? "").trim().toLowerCase()
    if (!k) continue
    if (postBelongsHere(p.conta) || findExplicitOwner(k)) continue
    const display = (p.conta ?? "").trim()
    const existing = unmappedContasMap.get(k)
    if (existing) {
      existing.count++
      if (existing.samples.length < 3) existing.samples.push(p.title)
    } else {
      unmappedContasMap.set(k, { conta: display, count: 1, samples: [p.title] })
    }
  }
  const unmappedContas = Array.from(unmappedContasMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // ─── Health panel + per-client aggregates ────────────────────────────────────
  // These are cheap (couple of GROUP BY queries) and feed both the
  // attention panel (recent failures, inactive clients) and the agency-mode
  // per-client cards.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  // Approval activity (last 14d). One query, bucketed in JS — these tables
  // stay small per-client so it's cheap. Drives the new "Aprovações"
  // widget below the health panel.
  const approvalFilter = isAgency
    ? inArray(approvalLink.clientId, clientIds)
    : eq(approvalLink.clientId, clientIds[0])

  const [recentFailures, lastPerClient, monthByClient, approvalRows, topPostCandidates] = await Promise.all([
    // Most recent failures (across scope) — drives the "needs review" item.
    db
      .select({
        id: publishLog.id,
        title: publishLog.postTitle,
        clientId: publishLog.clientId,
        platform: publishLog.platform,
        publishedAt: publishLog.publishedAt,
        error: publishLog.error,
        notionPageId: publishLog.notionPageId,
      })
      .from(publishLog)
      .where(and(logsFilter, eq(publishLog.status, "failed"), gte(publishLog.publishedAt, sevenDaysAgo)))
      .orderBy(desc(publishLog.publishedAt))
      .limit(5),
    // Most recent successful publish per client — drives "inactive client" warning.
    db
      .select({ clientId: publishLog.clientId, lastAt: max(publishLog.publishedAt) })
      .from(publishLog)
      .where(and(logsFilter, eq(publishLog.status, "published")))
      .groupBy(publishLog.clientId),
    // Publishes this month per client — drives agency-mode per-client cards.
    db
      .select({ clientId: publishLog.clientId, total: count() })
      .from(publishLog)
      .where(and(logsFilter, eq(publishLog.status, "published"), gte(publishLog.publishedAt, startOfMonth)))
      .groupBy(publishLog.clientId),
    // Approval rows from last 14d (covers stale + recent decisions). Bucketed
    // in JS — each client typically has < 50 rows in this window so the
    // savings of an aggregate-side bucket aren't worth the SQL complexity.
    db
      .select({
        clientId: approvalLink.clientId,
        decision: approvalLink.decision,
        tacit: approvalLink.tacit,
        expiresAt: approvalLink.expiresAt,
        sentAt: approvalLink.sentAt,
        createdAt: approvalLink.createdAt,
        decidedAt: approvalLink.decidedAt,
        postTitle: approvalLink.postTitle,
        contactName: approvalLink.contactName,
        contactPhone: approvalLink.contactPhone,
        token: approvalLink.token,
        notionPageId: approvalLink.notionPageId,
        kind: approvalLink.kind,
        productionId: approvalLink.productionId,
      })
      .from(approvalLink)
      .where(and(approvalFilter, gte(approvalLink.createdAt, fourteenDaysAgo))),
    // Top performer last 30 days. Pulled with a small LIMIT so we can rank
    // by (likes + reach) in JS — Postgres can't sort by that without a
    // generated column, and the row count's tiny anyway.
    db
      .select({
        id: publishLog.id,
        clientId: publishLog.clientId,
        title: publishLog.postTitle,
        conta: publishLog.conta,
        platform: publishLog.platform,
        publishedAt: publishLog.publishedAt,
        permalink: publishLog.platformPostUrl,
        likes: publishLog.metricsLikes,
        comments: publishLog.metricsComments,
        reach: publishLog.metricsReach,
      })
      .from(publishLog)
      .where(and(
        logsFilter,
        eq(publishLog.status, "published"),
        gte(publishLog.publishedAt, thirtyDaysAgo),
        isNotNull(publishLog.metricsLastSyncedAt),
      ))
      .orderBy(desc(publishLog.metricsReach))
      .limit(20),
  ])

  // Pick winner: highest (reach + likes). Reach alone biases toward Reels;
  // adding likes rewards engagement-heavy carousels too.
  const topPost = topPostCandidates
    .map((p) => ({ ...p, score: (p.reach ?? 0) + (p.likes ?? 0) }))
    .sort((a, b) => b.score - a.score)[0]
  const showTopPost = topPost && topPost.score > 0

  // Bucket approval rows for the widget below.
  const STALE_MS = 3 * 24 * 60 * 60 * 1000
  const nowMs = Date.now()
  const approvalsPending: typeof approvalRows = []
  const approvalsStale: typeof approvalRows = []
  // Aprovação tácita (silêncio = sim em 30d): decision='approved' && tacit=true.
  // Widget mostra como métrica positiva mas com tom amber (distingue de explícita).
  const approvalsTacit7d: typeof approvalRows = []
  const approvalsDecided7d: typeof approvalRows = []
  const approvalsApproved7d: typeof approvalRows = []
  const pendingByClient = new Map<string, number>()
  const staleByClient = new Map<string, number>()
  for (const r of approvalRows) {
    const decidedMs = r.decidedAt ? new Date(r.decidedAt).getTime() : 0
    const sentMs = r.sentAt ? new Date(r.sentAt).getTime() : new Date(r.createdAt).getTime()
    // decision='expired' = orphan/cancelado pelo cron. NÃO conta como
    // decisão (não foi cliente nem tácito) — apenas sai do pending.
    if (r.decision === "expired") {
      continue
    }
    if (r.decision !== null) {
      if (decidedMs >= sevenDaysAgo.getTime()) {
        approvalsDecided7d.push(r)
        if (r.decision === "approved") {
          approvalsApproved7d.push(r)
          if (r.tacit) approvalsTacit7d.push(r)
        }
      }
      continue
    }
    approvalsPending.push(r)
    pendingByClient.set(r.clientId ?? "", (pendingByClient.get(r.clientId ?? "") ?? 0) + 1)
    if (nowMs - sentMs > STALE_MS) {
      approvalsStale.push(r)
      staleByClient.set(r.clientId ?? "", (staleByClient.get(r.clientId ?? "") ?? 0) + 1)
    }
  }
  // Split pending by kind so the dashboard card can show "X posts · Y produções"
  // — schema discriminates via approvalLink.kind ('post' vs 'production_script').
  const pendingPosts = approvalsPending.filter((r) => r.kind !== "production_script").length
  const pendingProductions = approvalsPending.filter((r) => r.kind === "production_script").length
  // Show the widget only when there's something to act on or recently
  // decided activity worth surfacing — keeps the dashboard quiet for
  // clients that don't use the approval flow.
  const showApprovalsWidget =
    approvalsPending.length > 0 || approvalsTacit7d.length > 0 || approvalsDecided7d.length > 0

  const lastByClient = new Map(lastPerClient.map((r) => [r.clientId, r.lastAt ? new Date(r.lastAt) : null]))
  const monthCountByClient = new Map(monthByClient.map((r) => [r.clientId, Number(r.total)]))
  const upcomingByClient = new Map<string, number>()
  for (const p of upcoming) {
    if (p.clientId) upcomingByClient.set(p.clientId, (upcomingByClient.get(p.clientId) ?? 0) + 1)
  }

  // Inactive = no successful publish in last 14 days. Skip clients that never
  // configured Notion (no point flagging — already shown in setup wizard).
  const clientHasConnection = new Set(notion.map((n) => n.clientId).filter(Boolean) as string[])
  const inactiveClients = allowedClients.filter((c) => {
    if (!clientHasConnection.has(c.id)) return false
    const last = lastByClient.get(c.id)
    return !last || last < fourteenDaysAgo
  })

  const hasHealthIssues = recentFailures.length > 0 || inactiveClients.length > 0 || unmappedContas.length > 0

  const notionConnected = notion.length > 0
  const notionHasDb = notion.some((n) => n.databaseId)
  const hasAccounts = accounts.filter((a) => a.active).length > 0
  const hasMapping = mappings.length > 0
  const isReady = notionConnected && notionHasDb && hasMapping && hasAccounts

  // Single-client first-run redirect to onboarding. Skip in agency mode —
  // user already has at least 2 clients and knows what they're doing.
  if (
    scope.mode === "single" &&
    !notionConnected &&
    !hasAccounts &&
    logs.length === 0 &&
    scope.client.name === "Cliente padrão"
  ) {
    redirect("/onboarding")
  }

  const totalPublished = stats.find((s) => s.status === "published")?.total ?? 0
  const totalFailed = stats.find((s) => s.status === "failed")?.total ?? 0

  const PLATFORM_META: Record<string, { label: string; icon: any }> = {
    instagram: { label: "Instagram", icon: Instagram },
    facebook: { label: "Facebook", icon: Facebook },
    youtube: { label: "YouTube", icon: Youtube },
    tiktok: { label: "TikTok", icon: null },
    linkedin: { label: "LinkedIn", icon: Linkedin },
  }
  const PLATFORM_ORDER = ["instagram", "facebook", "youtube", "tiktok", "linkedin"]
  const activeByPlatform = PLATFORM_ORDER.map((p) => ({
    platform: p,
    label: PLATFORM_META[p]?.label ?? p,
    icon: PLATFORM_META[p]?.icon,
    active: accounts.filter((a) => a.platform === p && a.active).length,
    total: accounts.filter((a) => a.platform === p).length,
  })).filter((x) => x.total > 0)

  const headerLabel =
    scope.mode === "all"
      ? `Todos os clientes (${scope.clients.length})`
      : scope.client.name
  const statSubtitle = isAgency ? "agregado de todos os clientes" : "total deste cliente"

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Dashboard"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {isAgency ? (
              <span className="inline-flex items-center gap-1.5">
                <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-primary">{headerLabel}</span>
              </span>
            ) : (
              <span>{headerLabel}</span>
            )}
            <span aria-hidden="true">·</span>
            <span>Olá, {session!.user.name} 👋</span>
          </span>
        }
        action={!isAgency && isReady ? <PublishButton /> : undefined}
      />

      {hasHealthIssues && (
        <div className="mb-8 rounded-xl border border-warning/40 bg-warning/5 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <p className="text-base font-semibold">Precisa de atenção</p>
          </div>
          <div className="space-y-3">
            {recentFailures.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {recentFailures.length} {recentFailures.length === 1 ? "publicação falhou" : "publicações falharam"} nos últimos 7 dias
                </p>
                <ul className="mt-1.5 space-y-1">
                  {recentFailures.map((f) => {
                    const owning = f.clientId ? clientById.get(f.clientId) : null
                    return (
                      <li key={f.id} className="flex items-start gap-2 text-base">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                        <div className="min-w-0 flex-1">
                          {/* Title + meta on one row that wraps; using
                              block + line-clamp keeps it tidy on mobile
                              where post titles can be long ("Jaecoo 7
                              2027 ganha versão de entrada Elite por…").
                              `truncate` on inline <span> doesn't apply,
                              so we wrap with line-clamp-1 instead. */}
                          <p className="line-clamp-1 break-words">
                            {f.title || "Post sem título"}
                            {scope.mode === "all" && owning && (
                              <span className="ml-1.5 text-sm text-muted-foreground">· {owning.name}</span>
                            )}
                            <span className="ml-1.5 text-sm text-muted-foreground">· {f.platform}</span>
                          </p>
                          {f.error && (
                            // line-clamp + break-all so long error
                            // strings (Meta IDs, stack traces) stay
                            // bounded on mobile instead of pushing the
                            // arrow icon off-screen.
                            <p className="mt-0.5 line-clamp-2 break-all font-mono text-sm text-destructive/80">
                              {f.error}
                            </p>
                          )}
                        </div>
                        <Link
                          href={`/scheduled?postId=${encodeURIComponent(f.notionPageId)}`}
                          title="Abrir no calendário"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-warning hover:bg-warning/15"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
                <Link href="/scheduled?filter=errors" className="mt-2 inline-block text-sm text-warning underline hover:no-underline">
                  Ver todos os erros →
                </Link>
              </div>
            )}
            {inactiveClients.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {inactiveClients.length} {inactiveClients.length === 1 ? "cliente sem publicar há 14+ dias" : "clientes sem publicar há 14+ dias"}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {inactiveClients.map((c) => {
                    const last = lastByClient.get(c.id)
                    const isActiveAlready = scope.mode === "single" && scope.client.id === c.id
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
                        <MoonStar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="break-words">{c.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {last ? `· última em ${last.toLocaleDateString("pt-BR")}` : "· nenhuma publicação"}
                        </span>
                        {!isActiveAlready && (
                          <SwitchClientButton
                            clientId={c.id}
                            className="ml-auto inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[13px] font-medium text-warning hover:bg-warning/20"
                          >
                            <span className="inline-flex items-center gap-1">
                              Abrir cliente
                              <ArrowRight className="h-3 w-3" />
                            </span>
                          </SwitchClientButton>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {unmappedContas.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {unmappedContas.reduce((s, u) => s + u.count, 0)} post{unmappedContas.reduce((s, u) => s + u.count, 0) === 1 ? "" : "s"} com <code className="rounded bg-muted px-1 font-mono text-[12px]">conta</code> não mapeada — não vão publicar até resolver
                </p>
                <ul className="mt-1.5 space-y-1">
                  {unmappedContas.map((u) => (
                    <li key={u.conta} className="flex flex-wrap items-start gap-2 text-base">
                      <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{u.conta || "(sem conta)"}</span>
                        <span className="ml-1.5 text-sm text-muted-foreground">
                          · {u.count} post{u.count === 1 ? "" : "s"}
                        </span>
                        {u.samples.length > 0 && (
                          <p className="mt-0.5 text-[13px] text-muted-foreground truncate">
                            ex: {u.samples.join(", ")}
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/clients`}
                        className="ml-auto inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[13px] font-medium text-warning hover:bg-warning/20"
                      >
                        Mapear
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Para resolver: abra <Link href="/clients" className="underline">/clients</Link> → edite o cliente correto → painel <strong>Contas do Notion mapeadas</strong> → adicione o valor exato como aparece no Notion.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {showApprovalsWidget && (
        <div className="mb-8 rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-amber-500" />
              <p className="text-base font-semibold">Aprovações</p>
            </div>
            <Link
              href="/scheduled?filter=approval"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Ver tudo no calendário
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Top-line counts. Stale highlights the chase signal — without
              this people see "5 pendentes" and assume everything is fine.
              Hero numbers bumped to text-4xl so a quick scan immediately
              tells the agency what needs attention without reading
              labels. */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border-l-4 border-l-primary/30 bg-card p-4">
              <div className="flex items-baseline gap-3">
                <div>
                  <p className="text-3xl font-semibold leading-none tracking-tight">{pendingPosts}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">Posts</p>
                </div>
                <div>
                  <p className="text-3xl font-semibold leading-none tracking-tight">{pendingProductions}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">Produções</p>
                </div>
              </div>
              <p className="mt-2 text-[12px] uppercase tracking-wider text-muted-foreground">Pendentes</p>
            </div>
            <div className={cn(
              "rounded-lg border-l-4 p-4",
              approvalsStale.length > 0 ? "border-l-warning/60 bg-warning/[0.06]" : "border-l-muted bg-card"
            )}>
              <p className={cn(
                "text-4xl font-semibold leading-none tracking-tight",
                approvalsStale.length > 0 ? "text-warning" : "text-muted-foreground/60",
              )}>
                {approvalsStale.length}
              </p>
              <p className="mt-2 text-[12px] uppercase tracking-wider text-muted-foreground">Parados +3d</p>
            </div>
            <div className="rounded-lg border-l-4 border-l-success/40 bg-card p-4">
              <p className="text-4xl font-semibold leading-none tracking-tight text-success">{approvalsApproved7d.length}</p>
              <p className="mt-2 text-[12px] uppercase tracking-wider text-muted-foreground">Aprovados 7d</p>
            </div>
            <div className={cn(
              "rounded-lg border-l-4 p-4",
              approvalsTacit7d.length > 0 ? "border-l-warning/40 bg-warning/[0.04]" : "border-l-muted bg-card",
            )}
              title="Aprovados automaticamente por silêncio (30 dias sem resposta do cliente)"
            >
              <p className={cn(
                "text-4xl font-semibold leading-none tracking-tight",
                approvalsTacit7d.length > 0 ? "text-warning" : "text-muted-foreground/60",
              )}>
                {approvalsTacit7d.length}
              </p>
              <p className="mt-2 text-[12px] uppercase tracking-wider text-muted-foreground">Aprovações tácitas</p>
            </div>
          </div>

          {/* Per-client breakdown — only in agency mode. Single-client view
              already knows whose approvals these are. */}
          {pendingByClient.size > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[13px] font-medium uppercase tracking-wider text-muted-foreground">
                {isAgency ? "Por cliente" : "Pendentes"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(pendingByClient.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([cid, n]) => {
                    const c = clientById.get(cid)
                    const stale = staleByClient.get(cid) ?? 0
                    return (
                      <span
                        key={cid}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-sm",
                          stale > 0 ? "border-warning/50 bg-warning/10 text-warning" : "border-muted bg-muted/30",
                        )}
                      >
                        {c?.logoUrl ? (
                          <img src={c.logoUrl} alt="" className="h-3 w-3 rounded-full object-cover" />
                        ) : (
                          <Building2 className="h-3 w-3 opacity-60" />
                        )}
                        <span className="font-medium">{c?.name ?? "(removido)"}</span>
                        <span className="font-mono text-[12px] opacity-80">
                          {n}{stale > 0 ? ` (${stale} parado)` : ""}
                        </span>
                        {cid && <NotifyPendingButton clientId={cid} pendingCount={n} />}
                        {cid && <PendingDetailsButton clientId={cid} />}
                      </span>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Top stale rows — most actionable. Cap at 5; anything more goes
              to /scheduled?filter=approval. */}
          {approvalsStale.length > 0 && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium uppercase tracking-wider text-warning">
                Precisa cobrar ({approvalsStale.length})
              </p>
              <ul className="space-y-1">
                {approvalsStale.slice(0, 5).map((r) => {
                  const owning = r.clientId ? clientById.get(r.clientId) : null
                  const sentAgo = r.sentAt
                    ? Math.floor((nowMs - new Date(r.sentAt).getTime()) / (24 * 60 * 60 * 1000))
                    : Math.floor((nowMs - new Date(r.createdAt).getTime()) / (24 * 60 * 60 * 1000))
                  const isProduction = r.kind === "production_script"
                  // Roteiros vão pra /productions/<id>; posts pra /scheduled?postId=…
                  // Sem isso, click num roteiro caía em /scheduled e quebrava.
                  const targetHref = isProduction && r.productionId
                    ? `/productions/${r.productionId}`
                    : `/scheduled?postId=${encodeURIComponent(r.notionPageId)}`
                  return (
                    <li key={r.token} className="flex items-start gap-2 text-base">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      <div className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "mr-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                            isProduction ? "bg-info/15 text-info" : "bg-primary/15 text-primary",
                          )}
                          title={isProduction ? "Aprovação de roteiro de produção" : "Aprovação de post agendado"}
                        >
                          {isProduction ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                          {isProduction ? "Produção" : "Post"}
                        </span>
                        <span className="truncate">{r.postTitle || "Sem título"}</span>
                        {scope.mode === "all" && owning && (
                          <span className="ml-1.5 text-sm text-muted-foreground">· {owning.name}</span>
                        )}
                        {r.contactName && (
                          <span className="ml-1.5 text-sm text-muted-foreground">· {r.contactName}</span>
                        )}
                        <span className="ml-1.5 text-sm text-warning">· há {sentAgo}d</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {r.contactPhone && (
                          <a
                            href={`https://wa.me/${r.contactPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá${r.contactName ? ` ${r.contactName}` : ""}! Lembrete pra aprovar ${isProduction ? "o roteiro" : "o post"} "${r.postTitle ?? ""}":`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir WhatsApp"
                            className="inline-flex h-6 items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 text-[12px] font-medium text-warning hover:bg-warning/20"
                          >
                            <MessageCircle className="h-3 w-3" />
                            WA
                          </a>
                        )}
                        <Link
                          href={targetHref}
                          title={isProduction ? "Abrir produção" : "Abrir no calendário"}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-warning hover:bg-warning/15"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
              {approvalsStale.length > 5 && (
                <Link
                  href="/scheduled?filter=approval"
                  className="mt-2 inline-block text-sm text-warning underline hover:no-underline"
                >
                  + {approvalsStale.length - 5} outros parados →
                </Link>
              )}
            </div>
          )}

          {/* Recent decisions — social proof / activity heartbeat. Hidden
              if there's nothing in the last 7 days, to keep the widget small. */}
          {approvalsDecided7d.length > 0 && (
            <div className={cn(approvalsStale.length > 0 ? "mt-3 border-t pt-3" : "")}>
              <p className="mb-1.5 text-[13px] font-medium uppercase tracking-wider text-muted-foreground">
                Decisões recentes (7d)
              </p>
              <ul className="space-y-1 text-base">
                {approvalsDecided7d.slice(0, 5).map((r) => {
                  const owning = r.clientId ? clientById.get(r.clientId) : null
                  const Icon = r.decision === "approved" ? ThumbsUp : XCircle
                  const tone = r.decision === "approved" ? "text-success" : "text-warning"
                  const decidedDate = r.decidedAt ? new Date(r.decidedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""
                  const isProduction = r.kind === "production_script"
                  return (
                    <li key={r.token} className="flex items-start gap-2">
                      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tone)} />
                      <div className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "mr-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                            isProduction ? "bg-info/15 text-info" : "bg-primary/15 text-primary",
                          )}
                        >
                          {isProduction ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                          {isProduction ? "Produção" : "Post"}
                        </span>
                        <span className="truncate">{r.postTitle || "Sem título"}</span>
                        {scope.mode === "all" && owning && (
                          <span className="ml-1.5 text-sm text-muted-foreground">· {owning.name}</span>
                        )}
                        <span className="ml-1.5 text-sm text-muted-foreground">
                          · {r.decision === "approved" ? "aprovou" : r.decision === "rejected" ? "rejeitou" : "pediu alterações"}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm text-muted-foreground">{decidedDate}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {scope.mode === "all" && (
        <div className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Clientes ({scope.clients.length})
            </p>
            <p className="text-sm text-muted-foreground">
              Toque pra trocar para um cliente específico
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scope.clients.map((c) => {
              const last = lastByClient.get(c.id)
              const monthCount = monthCountByClient.get(c.id) ?? 0
              const upcomingForThisClient = upcomingByClient.get(c.id) ?? 0
              const inactive = inactiveClients.some((x) => x.id === c.id)
              const hasNotionConfigured = clientHasConnection.has(c.id)
              return (
                <AgencyClientCard key={c.id} clientId={c.id} inactive={inactive}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    {c.logoUrl ? (
                      <img src={c.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-4 w-4" />
                      </div>
                    )}
                    <p className="font-medium truncate flex-1">{c.name}</p>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                  </div>
                  {!hasNotionConfigured ? (
                    <p className="text-sm text-muted-foreground">Notion não configurado</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-lg border-l-2 border-l-success/40 bg-card p-2.5">
                          <p className="text-2xl font-semibold leading-none tracking-tight">{monthCount}</p>
                          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1.5">
                            Publ. mês
                          </p>
                        </div>
                        <div className="rounded-lg border-l-2 border-l-primary/40 bg-card p-2.5">
                          <p className="text-2xl font-semibold leading-none tracking-tight">{upcomingForThisClient}</p>
                          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1.5">
                            Agendados
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {last
                          ? <>Última: {last.toLocaleDateString("pt-BR")}{inactive && <span className="text-warning"> · inativo</span>}</>
                          : "Sem publicações ainda"}
                      </p>
                    </>
                  )}
                </AgencyClientCard>
              )
            })}
          </div>
        </div>
      )}

      {scope.mode === "single" && !isReady && (() => {
        const items: Array<{
          done: boolean
          blocked?: boolean
          blockedReason?: string
          label: string
          description: string
          cta: { href: string; label: string; icon: any }
        }> = [
          {
            done: notionConnected,
            label: "Conectar Notion",
            description: "Autorize o acesso ao seu workspace do Notion.",
            cta: { href: "/settings", label: "Conectar Notion", icon: BookOpen },
          },
          {
            done: notionHasDb,
            blocked: !notionConnected,
            blockedReason: "Conectar Notion",
            label: "Selecionar banco de dados",
            description: "Escolha o database do Notion onde estão os posts.",
            cta: { href: "/settings", label: "Selecionar banco", icon: BookOpen },
          },
          {
            done: hasMapping,
            blocked: !notionHasDb,
            blockedReason: "Selecionar banco de dados",
            label: "Configurar mapeamento",
            description: "Diga ao app quais colunas são título, data, conta, mídia, etc.",
            cta: { href: "/settings", label: "Configurar campos", icon: Zap },
          },
          {
            done: hasAccounts,
            label: "Conectar conta social",
            description: "Pelo menos uma conta de Instagram, Facebook ou outra.",
            cta: { href: "/accounts", label: "Conectar conta", icon: Instagram },
          },
        ]
        const nextIndex = items.findIndex((i) => !i.done && !i.blocked)
        const completed = items.filter((i) => i.done).length
        return (
          <div className="mb-8 rounded-xl border border-primary/20 border-l-4 border-l-primary bg-gradient-to-br from-primary/5 to-transparent p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">Configure este cliente</h3>
                  <span className="text-sm text-muted-foreground">{completed}/{items.length} concluídos</span>
                </div>
                <p className="mt-1 text-base text-muted-foreground">
                  Para começar a publicar em <strong>{scope.client.name}</strong>, complete os 4 passos abaixo.
                </p>
                <ol className="mt-4 space-y-2">
                  {items.map((item, i) => {
                    const Icon = item.cta.icon
                    const isNext = i === nextIndex
                    return (
                      <li
                        key={item.label}
                        className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${
                          item.done
                            ? "border-success/30 bg-success/5"
                            : isNext
                              ? "border-primary/40 bg-primary/5"
                              : "border-muted bg-muted/20 opacity-60"
                        }`}
                      >
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-medium">
                          {item.done ? (
                            <CheckCircle2 className="h-5 w-5 text-success" />
                          ) : (
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${isNext ? "border-primary text-primary" : "border-muted-foreground/30 text-muted-foreground"}`}>
                              {i + 1}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-base font-medium ${item.done ? "text-success line-through opacity-75" : ""}`}>
                            {item.label}
                          </p>
                          {!item.done && (
                            <p className="text-sm text-muted-foreground">
                              {item.blocked && item.blockedReason
                                ? <>Aguardando: <span className="font-medium">{item.blockedReason}</span></>
                                : item.description}
                            </p>
                          )}
                        </div>
                        {!item.done && isNext && (
                          <Button size="sm" asChild>
                            <Link href={item.cta.href}>
                              <Icon className="h-4 w-4" /> {item.cta.label}
                            </Link>
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Bento "snapshot": Top Post grande à esquerda (8 cols × 3 rows)
          + 3 KPIs empilhados à direita (4 cols × 1 row cada). Quando não
          existe Top Post (cliente sem histórico de publicação), colapsa
          pra 3 KPIs em linha horizontal — fallback simples. */}
      <div className={cn(
        "stagger-children mb-8 grid gap-4",
        showTopPost && topPost
          ? "md:grid-cols-12 md:auto-rows-fr"
          : "sm:grid-cols-3"
      )}>
        {showTopPost && topPost && (
          <div className="relative overflow-hidden rounded-xl border border-success/30 bg-gradient-to-br from-success/[0.08] to-transparent p-6 md:col-span-8 md:row-span-3">
            <div className="absolute right-0 top-0 -z-0 h-72 w-72 -translate-y-1/3 translate-x-1/3 rounded-full bg-success/10 blur-3xl" />
            <div className="relative flex h-full flex-col">
              <div className="mb-3 flex items-center gap-2">
                <ThumbsUp className="h-4 w-4 text-success" />
                <p className="text-[12px] uppercase tracking-wider text-success font-semibold">Destaque dos últimos 30 dias</p>
              </div>
              <p className="text-2xl font-semibold tracking-tight break-words md:text-3xl">{topPost.title || "Post sem título"}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                @{topPost.conta}
                {topPost.platform && <> · {topPost.platform}</>}
                {isAgency && topPost.clientId && clientById.get(topPost.clientId) && (
                  <> · {clientById.get(topPost.clientId)!.name}</>
                )}
                {" · "}
                {new Date(topPost.publishedAt).toLocaleDateString("pt-BR")}
              </p>
              <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                {(topPost.likes ?? 0) > 0 && (
                  <span className="inline-flex items-baseline gap-1.5">
                    <strong className="text-2xl font-semibold text-success">{topPost.likes!.toLocaleString("pt-BR")}</strong>
                    <span className="text-sm text-muted-foreground">curtidas</span>
                  </span>
                )}
                {(topPost.comments ?? 0) > 0 && (
                  <span className="inline-flex items-baseline gap-1.5">
                    <strong className="text-2xl font-semibold text-success">{topPost.comments!.toLocaleString("pt-BR")}</strong>
                    <span className="text-sm text-muted-foreground">comentários</span>
                  </span>
                )}
                {(topPost.reach ?? 0) > 0 && (
                  <span className="inline-flex items-baseline gap-1.5">
                    <strong className="text-2xl font-semibold text-success">{topPost.reach!.toLocaleString("pt-BR")}</strong>
                    <span className="text-sm text-muted-foreground">de alcance</span>
                  </span>
                )}
              </div>
              {topPost.permalink && (
                <div className="mt-auto pt-4">
                  <Button variant="outline" size="sm" asChild>
                    <a href={topPost.permalink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver post
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        <Link
          href="/scheduled?filter=upcoming"
          className={cn("group", showTopPost && topPost && "md:col-span-4")}
        >
          <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-primary/[0.03]">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                Agendados
                <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
              </CardDescription>
              <CardTitle className="text-4xl font-normal text-primary">{upcomingCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">prontos para publicar</p>
            </CardContent>
          </Card>
        </Link>
        <Link
          href="/scheduled?filter=published"
          className={cn("group", showTopPost && topPost && "md:col-span-4")}
        >
          <Card className="h-full transition-colors group-hover:border-success/40 group-hover:bg-success/[0.03]">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                Publicados
                <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
              </CardDescription>
              <CardTitle className="text-4xl font-normal text-success">{totalPublished}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{statSubtitle}</p>
            </CardContent>
          </Card>
        </Link>
        <Link
          href="/scheduled?filter=errors"
          className={cn("group", showTopPost && topPost && "md:col-span-4")}
        >
          <Card className="h-full transition-colors group-hover:border-destructive/40 group-hover:bg-destructive/[0.03]">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                Com erro
                <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
              </CardDescription>
              <CardTitle className="text-4xl font-normal text-destructive">{totalFailed}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{statSubtitle}</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {(isReady || isAgency) && (
        <Card className="mb-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Próximas publicações</CardTitle>
              <CardDescription>
                {isAgency ? `Próximos posts em todos os clientes` : `Próximos posts agendados`}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/scheduled">Ver tudo <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {nextFive.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nenhum post na fila"
                description='Marque posts como "Agendamento" no Notion para vê-los aqui.'
                action={!isAgency && notion[0]?.databaseId ? {
                  label: "Abrir Notion",
                  href: `https://www.notion.so/${notion[0].databaseId.replace(/-/g, "")}`,
                  external: true,
                } : undefined}
                className="py-8"
              />
            ) : (
              <div className="space-y-2">
                {nextFive.map((p) => {
                  const owning = p.clientId ? clientById.get(p.clientId) : null
                  const issues = computeNextPostIssues(p, accounts)
                  const isDue = p.scheduledDate ? new Date(p.scheduledDate) <= new Date() : false
                  const canPublishNow = isDue && issues.length === 0
                  return (
                    <div
                      key={`${p.connectionId}-${p.pageId}`}
                      className={`rounded-lg border p-3 ${issues.length > 0 ? "border-warning/40 bg-warning/5" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={notionUrlFor(p)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir no Notion"
                              className="group inline-flex items-center gap-1.5 min-w-0 text-base font-medium hover:underline"
                            >
                              <span className="break-words">{p.title || "Sem título"}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
                            </a>
                            {isAgency && owning && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">
                                {owning.logoUrl ? (
                                  <img src={owning.logoUrl} alt="" className="h-3 w-3 rounded-full object-cover" />
                                ) : (
                                  <Building2 className="h-3 w-3" />
                                )}
                                {owning.name}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {p.conta} {p.publishTargets.length > 0 && (
                              <>· {p.publishTargets.map((t) => t.raw).join(", ")}</>
                            )}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm text-muted-foreground inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            {p.scheduledDate
                              ? new Date(p.scheduledDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                              : "Sem data"}
                          </p>
                        </div>
                      </div>
                      {issues.length > 0 && (
                        <ul className="mt-2 space-y-1.5">
                          {issues.map((issue) => (
                            <li key={issue.message} className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm text-warning">
                              <span className="flex items-start gap-1.5">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                <span>{issue.message}</span>
                              </span>
                              {issue.actionExternal ? (
                                <a
                                  href={issue.actionHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[13px] font-medium text-warning hover:bg-warning/20"
                                >
                                  {issue.actionLabel}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <Link
                                  href={issue.actionHref}
                                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[13px] font-medium text-warning hover:bg-warning/20"
                                >
                                  {issue.actionLabel}
                                </Link>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/scheduled?postId=${encodeURIComponent(p.pageId)}`}
                          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-sm font-medium hover:bg-accent"
                        >
                          <CalendarClock className="h-3 w-3" />
                          Calendário
                        </Link>
                        {canPublishNow && p.connectionId && (
                          <DashboardPublishNow pageId={p.pageId} connectionId={p.connectionId} />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-8">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Contas ativas por plataforma</CardTitle>
              <CardDescription>
                {scope.mode === "all" ? "Somando todos os clientes" : `Onde ${scope.client.name} pode publicar`}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/accounts">Gerenciar <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activeByPlatform.length === 0 ? (
            <EmptyState
              icon={Instagram}
              title={isAgency ? "Nenhuma conta conectada em nenhum cliente" : "Nenhuma conta conectada"}
              description="Conecte Instagram, Facebook, YouTube, TikTok ou LinkedIn pra começar a publicar."
              action={{ label: "Conectar conta", href: "/accounts" }}
              tone="warning"
              className="py-8"
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeByPlatform.map((p) => {
                const Icon = p.icon
                const isActive = p.active > 0
                return (
                  <div
                    key={p.platform}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${isActive ? "border-success/30 bg-success/5" : "bg-muted/20"}`}
                  >
                    <div className="flex items-center gap-2.5">
                      {Icon ? (
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <div className="h-4 w-4 rounded-sm bg-foreground/70" />
                      )}
                      <span className="text-base font-medium">{p.label}</span>
                    </div>
                    <span className={isActive ? "text-base font-semibold text-success" : "text-base text-muted-foreground"}>
                      {p.active} ativa{p.active === 1 ? "" : "s"}
                      {p.total !== p.active && <span className="ml-1 text-sm text-muted-foreground">/ {p.total}</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>
              {isAgency ? "Últimas 10 publicações em todos os clientes" : "Últimas 10 publicações deste cliente"}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/activity">Ver tudo <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Nenhuma publicação ainda"
              description='Configure as contas e marque posts como "Agendamento" no Notion.'
            />
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const owning = log.clientId ? clientById.get(log.clientId) : null
                return (
                  <div key={log.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {log.status === "published" && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}
                        {log.status === "failed" && <XCircle className="h-5 w-5 shrink-0 text-destructive" />}
                        {log.status === "skipped" && <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={`https://www.notion.so/${log.notionPageId.replace(/-/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir no Notion"
                              className="group inline-flex items-center gap-1.5 min-w-0 text-base font-medium hover:underline"
                            >
                              <span className="truncate">{log.postTitle || "Post sem título"}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
                            </a>
                            {isAgency && owning && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">
                                {owning.logoUrl ? (
                                  <img src={owning.logoUrl} alt="" className="h-3 w-3 rounded-full object-cover" />
                                ) : (
                                  <Building2 className="h-3 w-3" />
                                )}
                                {owning.name}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span>{log.conta} · {new Date(log.publishedAt).toLocaleString("pt-BR")}</span>
                            {log.status === "published" && log.metricsLastSyncedAt && (
                              <>
                                {(log.metricsLikes ?? 0) > 0 && (
                                  <span className="inline-flex items-center gap-0.5">
                                    · <Heart className="h-3 w-3" /> {log.metricsLikes}
                                  </span>
                                )}
                                {(log.metricsComments ?? 0) > 0 && (
                                  <span className="inline-flex items-center gap-0.5">
                                    · <MessageCircle className="h-3 w-3" /> {log.metricsComments}
                                  </span>
                                )}
                                {(log.metricsReach ?? 0) > 0 && (
                                  <span>· {log.metricsReach!.toLocaleString("pt-BR")} alc.</span>
                                )}
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={log.status === "published" ? "success" : log.status === "failed" ? "destructive" : "secondary"}>
                          {log.status === "published" ? "Publicado" : log.status === "failed" ? "Erro" : "Ignorado"}
                        </Badge>
                        <RecentActivityActions
                          notionPageId={log.notionPageId}
                          connectionId={log.connectionId}
                          status={log.status}
                        />
                      </div>
                    </div>
                    {log.status === "failed" && log.error && (
                      <p className="mt-2 rounded bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
                        {log.error}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
