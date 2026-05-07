import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { approvalLink, fieldMapping, instagramAccount, notionConnection, publishLog } from "@/lib/db/schema"
import { eq, desc, count, inArray, and, gte, max } from "drizzle-orm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Instagram, BookOpen, CheckCircle2, XCircle, Clock, Zap, ArrowRight, Facebook, Youtube, Linkedin, CalendarClock, LayoutGrid, Building2, AlertTriangle, MoonStar, ExternalLink, MessageCircle, ThumbsUp } from "lucide-react"
import Link from "next/link"
import { PublishButton } from "@/components/dashboard/publish-button"
import { SwitchClientButton } from "@/components/dashboard/switch-client-button"
import { AgencyClientCard } from "@/components/dashboard/agency-client-card"
import { RecentActivityActions } from "@/components/dashboard/recent-activity-actions"
import { DashboardPublishNow } from "@/components/dashboard/dashboard-publish-now"
import { getActiveClientScope } from "@/lib/active-client"
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
  // Same filter as /api/notion/scheduled: drop posts whose `conta` isn't a
  // connected account in this scope. Otherwise the dashboard would surface
  // posts that can't publish from here (limbo).
  const clientContas = new Set(accounts.filter((a) => a.active).map((a) => a.conta.toLowerCase()))
  const upcoming = upcomingRaw.filter((p) => p.conta && clientContas.has(p.conta.toLowerCase()))
  const upcomingCount = upcoming.length
  const nextFive = upcoming.slice(0, 5)

  // ─── Health panel + per-client aggregates ────────────────────────────────────
  // These are cheap (couple of GROUP BY queries) and feed both the
  // attention panel (recent failures, inactive clients) and the agency-mode
  // per-client cards.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  // Approval activity (last 14d). One query, bucketed in JS — these tables
  // stay small per-client so it's cheap. Drives the new "Aprovações"
  // widget below the health panel.
  const approvalFilter = isAgency
    ? inArray(approvalLink.clientId, clientIds)
    : eq(approvalLink.clientId, clientIds[0])

  const [recentFailures, lastPerClient, monthByClient, approvalRows] = await Promise.all([
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
        expiresAt: approvalLink.expiresAt,
        sentAt: approvalLink.sentAt,
        createdAt: approvalLink.createdAt,
        decidedAt: approvalLink.decidedAt,
        postTitle: approvalLink.postTitle,
        contactName: approvalLink.contactName,
        contactPhone: approvalLink.contactPhone,
        token: approvalLink.token,
        notionPageId: approvalLink.notionPageId,
      })
      .from(approvalLink)
      .where(and(approvalFilter, gte(approvalLink.createdAt, fourteenDaysAgo))),
  ])

  // Bucket approval rows for the widget below.
  const STALE_MS = 3 * 24 * 60 * 60 * 1000
  const nowMs = Date.now()
  const approvalsPending: typeof approvalRows = []
  const approvalsStale: typeof approvalRows = []
  const approvalsExpired: typeof approvalRows = []
  const approvalsDecided7d: typeof approvalRows = []
  const approvalsApproved7d: typeof approvalRows = []
  const pendingByClient = new Map<string, number>()
  const staleByClient = new Map<string, number>()
  for (const r of approvalRows) {
    const expiresMs = new Date(r.expiresAt).getTime()
    const decidedMs = r.decidedAt ? new Date(r.decidedAt).getTime() : 0
    const sentMs = r.sentAt ? new Date(r.sentAt).getTime() : new Date(r.createdAt).getTime()
    if (r.decision !== null) {
      if (decidedMs >= sevenDaysAgo.getTime()) {
        approvalsDecided7d.push(r)
        if (r.decision === "approved") approvalsApproved7d.push(r)
      }
      continue
    }
    if (expiresMs <= nowMs) {
      approvalsExpired.push(r)
      continue
    }
    approvalsPending.push(r)
    pendingByClient.set(r.clientId ?? "", (pendingByClient.get(r.clientId ?? "") ?? 0) + 1)
    if (nowMs - sentMs > STALE_MS) {
      approvalsStale.push(r)
      staleByClient.set(r.clientId ?? "", (staleByClient.get(r.clientId ?? "") ?? 0) + 1)
    }
  }
  // Show the widget only when there's something to act on or recently
  // decided activity worth surfacing — keeps the dashboard quiet for
  // clients that don't use the approval flow.
  const showApprovalsWidget =
    approvalsPending.length > 0 || approvalsExpired.length > 0 || approvalsDecided7d.length > 0

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

  const hasHealthIssues = recentFailures.length > 0 || inactiveClients.length > 0

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
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Dashboard</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            {isAgency ? (
              <>
                <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-primary">{headerLabel}</span>
              </>
            ) : (
              <span>{headerLabel}</span>
            )}
            <span>·</span>
            <span>Olá, {session!.user.name} 👋</span>
          </p>
        </div>
        {!isAgency && isReady && <PublishButton />}
      </div>

      {hasHealthIssues && (
        <div className="mb-8 rounded-xl border border-warning/40 bg-warning/5 p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <p className="text-sm font-semibold">Precisa de atenção</p>
          </div>
          <div className="space-y-3">
            {recentFailures.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {recentFailures.length} {recentFailures.length === 1 ? "publicação falhou" : "publicações falharam"} nos últimos 7 dias
                </p>
                <ul className="mt-1.5 space-y-1">
                  {recentFailures.map((f) => {
                    const owning = f.clientId ? clientById.get(f.clientId) : null
                    return (
                      <li key={f.id} className="flex items-start gap-2 text-sm">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                        <div className="min-w-0 flex-1">
                          <span className="truncate">{f.title || "Post sem título"}</span>
                          {scope.mode === "all" && owning && (
                            <span className="ml-1.5 text-xs text-muted-foreground">· {owning.name}</span>
                          )}
                          <span className="ml-1.5 text-xs text-muted-foreground">· {f.platform}</span>
                          {f.error && (
                            <p className="mt-0.5 text-xs text-destructive/80 truncate font-mono">{f.error}</p>
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
                <Link href="/scheduled?filter=errors" className="mt-2 inline-block text-xs text-warning underline hover:no-underline">
                  Ver todos os erros →
                </Link>
              </div>
            )}
            {inactiveClients.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {inactiveClients.length} {inactiveClients.length === 1 ? "cliente sem publicar há 14+ dias" : "clientes sem publicar há 14+ dias"}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {inactiveClients.map((c) => {
                    const last = lastByClient.get(c.id)
                    const isActiveAlready = scope.mode === "single" && scope.client.id === c.id
                    return (
                      <li key={c.id} className="flex items-center gap-2 text-sm">
                        <MoonStar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span>{c.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {last ? `· última em ${last.toLocaleDateString("pt-BR")}` : "· nenhuma publicação"}
                        </span>
                        {!isActiveAlready && (
                          <SwitchClientButton
                            clientId={c.id}
                            className="ml-auto inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning hover:bg-warning/20"
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
          </div>
        </div>
      )}

      {showApprovalsWidget && (
        <div className="mb-8 rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-semibold">Aprovações</p>
            </div>
            <Link
              href="/scheduled?filter=approval"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Ver tudo no calendário
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Top-line counts. Stale highlights the chase signal — without
              this people see "5 pendentes" and assume everything is fine. */}
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-muted/40 p-2.5">
              <p className="font-display text-2xl leading-none">{approvalsPending.length}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Pendentes</p>
            </div>
            <div className={cn(
              "rounded-lg p-2.5",
              approvalsStale.length > 0 ? "bg-warning/10" : "bg-muted/40"
            )}>
              <p className={cn(
                "font-display text-2xl leading-none",
                approvalsStale.length > 0 ? "text-warning" : "",
              )}>
                {approvalsStale.length}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Parados +3d</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-2.5">
              <p className="font-display text-2xl leading-none text-success">{approvalsApproved7d.length}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Aprovados 7d</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-2.5">
              <p className={cn(
                "font-display text-2xl leading-none",
                approvalsExpired.length > 0 ? "text-destructive" : "",
              )}>
                {approvalsExpired.length}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Expirados</p>
            </div>
          </div>

          {/* Per-client breakdown — only in agency mode. Single-client view
              already knows whose approvals these are. */}
          {isAgency && pendingByClient.size > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Por cliente
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
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
                          stale > 0 ? "border-warning/50 bg-warning/10 text-warning" : "border-muted bg-muted/30",
                        )}
                      >
                        {c?.logoUrl ? (
                          <img src={c.logoUrl} alt="" className="h-3 w-3 rounded-full object-cover" />
                        ) : (
                          <Building2 className="h-3 w-3 opacity-60" />
                        )}
                        <span className="font-medium">{c?.name ?? "(removido)"}</span>
                        <span className="font-mono text-[10px] opacity-80">
                          {n}{stale > 0 ? ` (${stale} parado)` : ""}
                        </span>
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
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-warning">
                Precisa cobrar ({approvalsStale.length})
              </p>
              <ul className="space-y-1">
                {approvalsStale.slice(0, 5).map((r) => {
                  const owning = r.clientId ? clientById.get(r.clientId) : null
                  const sentAgo = r.sentAt
                    ? Math.floor((nowMs - new Date(r.sentAt).getTime()) / (24 * 60 * 60 * 1000))
                    : Math.floor((nowMs - new Date(r.createdAt).getTime()) / (24 * 60 * 60 * 1000))
                  return (
                    <li key={r.token} className="flex items-start gap-2 text-sm">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      <div className="min-w-0 flex-1">
                        <span className="truncate">{r.postTitle || "Post sem título"}</span>
                        {scope.mode === "all" && owning && (
                          <span className="ml-1.5 text-xs text-muted-foreground">· {owning.name}</span>
                        )}
                        {r.contactName && (
                          <span className="ml-1.5 text-xs text-muted-foreground">· {r.contactName}</span>
                        )}
                        <span className="ml-1.5 text-xs text-warning">· há {sentAgo}d</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {r.contactPhone && (
                          <a
                            href={`https://wa.me/${r.contactPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá${r.contactName ? ` ${r.contactName}` : ""}! Lembrete pra aprovar o post "${r.postTitle ?? ""}":`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir WhatsApp"
                            className="inline-flex h-6 items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 text-[10px] font-medium text-warning hover:bg-warning/20"
                          >
                            <MessageCircle className="h-3 w-3" />
                            WA
                          </a>
                        )}
                        <Link
                          href={`/scheduled?postId=${encodeURIComponent(r.notionPageId)}`}
                          title="Abrir no calendário"
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
                  className="mt-2 inline-block text-xs text-warning underline hover:no-underline"
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
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Decisões recentes (7d)
              </p>
              <ul className="space-y-1 text-sm">
                {approvalsDecided7d.slice(0, 5).map((r) => {
                  const owning = r.clientId ? clientById.get(r.clientId) : null
                  const Icon = r.decision === "approved" ? ThumbsUp : XCircle
                  const tone = r.decision === "approved" ? "text-success" : "text-warning"
                  const decidedDate = r.decidedAt ? new Date(r.decidedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""
                  return (
                    <li key={r.token} className="flex items-start gap-2">
                      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tone)} />
                      <div className="min-w-0 flex-1">
                        <span className="truncate">{r.postTitle || "Post sem título"}</span>
                        {scope.mode === "all" && owning && (
                          <span className="ml-1.5 text-xs text-muted-foreground">· {owning.name}</span>
                        )}
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          · {r.decision === "approved" ? "aprovou" : r.decision === "rejected" ? "rejeitou" : "pediu alterações"}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{decidedDate}</span>
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Clientes ({scope.clients.length})
            </p>
            <p className="text-xs text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground">Notion não configurado</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-lg bg-muted/40 p-2">
                          <p className="font-display text-lg leading-none">{monthCount}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                            Publ. mês
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-2">
                          <p className="font-display text-lg leading-none">{upcomingForThisClient}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                            Agendados
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
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
                  <span className="text-xs text-muted-foreground">{completed}/{items.length} concluídos</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
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
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                          {item.done ? (
                            <CheckCircle2 className="h-5 w-5 text-success" />
                          ) : (
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${isNext ? "border-primary text-primary" : "border-muted-foreground/30 text-muted-foreground"}`}>
                              {i + 1}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${item.done ? "text-success line-through opacity-75" : ""}`}>
                            {item.label}
                          </p>
                          {!item.done && (
                            <p className="text-xs text-muted-foreground">
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

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Link href="/scheduled?filter=upcoming" className="group">
          <Card className="transition-colors group-hover:border-primary/40 group-hover:bg-primary/[0.03]">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                Agendados
                <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
              </CardDescription>
              <CardTitle className="font-display text-4xl font-normal text-primary">{upcomingCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">prontos para publicar</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/scheduled?filter=published" className="group">
          <Card className="transition-colors group-hover:border-success/40 group-hover:bg-success/[0.03]">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                Publicados
                <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
              </CardDescription>
              <CardTitle className="font-display text-4xl font-normal text-success">{totalPublished}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{statSubtitle}</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/scheduled?filter=errors" className="group">
          <Card className="transition-colors group-hover:border-destructive/40 group-hover:bg-destructive/[0.03]">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                Com erro
                <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
              </CardDescription>
              <CardTitle className="font-display text-4xl font-normal text-destructive">{totalFailed}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{statSubtitle}</p>
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
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CalendarClock className="mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium">Nenhum post na fila</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Marque posts como &quot;Agendamento&quot; no Notion para vê-los aqui.
                </p>
                {!isAgency && notion[0]?.databaseId && (
                  <a
                    href={`https://www.notion.so/${notion[0].databaseId.replace(/-/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Abrir Notion
                  </a>
                )}
              </div>
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
                            <p className="text-sm font-medium break-words">{p.title || "Sem título"}</p>
                            {isAgency && owning && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                {owning.logoUrl ? (
                                  <img src={owning.logoUrl} alt="" className="h-3 w-3 rounded-full object-cover" />
                                ) : (
                                  <Building2 className="h-3 w-3" />
                                )}
                                {owning.name}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {p.conta} {p.publishTargets.length > 0 && (
                              <>· {p.publishTargets.map((t) => t.raw).join(", ")}</>
                            )}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
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
                            <li key={issue.message} className="flex flex-wrap items-start gap-x-2 gap-y-1 text-xs text-warning">
                              <span className="flex items-start gap-1.5">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                <span>{issue.message}</span>
                              </span>
                              {issue.actionExternal ? (
                                <a
                                  href={issue.actionHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning hover:bg-warning/20"
                                >
                                  {issue.actionLabel}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <Link
                                  href={issue.actionHref}
                                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning hover:bg-warning/20"
                                >
                                  {issue.actionLabel}
                                </Link>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <a
                          href={notionUrlFor(p)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Notion
                        </a>
                        <Link
                          href={`/scheduled?postId=${encodeURIComponent(p.pageId)}`}
                          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
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
            <p className="py-3 text-sm text-muted-foreground">
              {isAgency
                ? "Nenhuma conta conectada em nenhum cliente ainda."
                : "Nenhuma conta conectada a este cliente ainda."}
              {" "}
              <Link href="/accounts" className="underline">Conectar agora</Link>.
            </p>
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
                      <span className="text-sm font-medium">{p.label}</span>
                    </div>
                    <span className={isActive ? "text-sm font-semibold text-success" : "text-sm text-muted-foreground"}>
                      {p.active} ativa{p.active === 1 ? "" : "s"}
                      {p.total !== p.active && <span className="ml-1 text-xs text-muted-foreground">/ {p.total}</span>}
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
            <Link href="/scheduled">Ver tudo <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium">Nenhuma publicação ainda</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Configure as contas e marque posts como &quot;Agendamento&quot; no Notion.
              </p>
            </div>
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
                            <p className="text-sm font-medium truncate">{log.postTitle || "Post sem título"}</p>
                            {isAgency && owning && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                {owning.logoUrl ? (
                                  <img src={owning.logoUrl} alt="" className="h-3 w-3 rounded-full object-cover" />
                                ) : (
                                  <Building2 className="h-3 w-3" />
                                )}
                                {owning.name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{log.conta} · {new Date(log.publishedAt).toLocaleString("pt-BR")}</p>
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
                      <p className="mt-2 rounded bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
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
