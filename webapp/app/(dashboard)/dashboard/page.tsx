import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { fieldMapping, instagramAccount, notionConnection, publishLog } from "@/lib/db/schema"
import { eq, desc, count, inArray, and, gte, max } from "drizzle-orm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Instagram, BookOpen, CheckCircle2, XCircle, Clock, Zap, ArrowRight, Facebook, Youtube, Linkedin, CalendarClock, LayoutGrid, Building2, AlertTriangle, MoonStar } from "lucide-react"
import Link from "next/link"
import { PublishButton } from "@/components/dashboard/publish-button"
import { getActiveClientScope } from "@/lib/active-client"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping, type NotionPost } from "@/lib/notion"

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

  const [accounts, notion, logs, stats] = await Promise.all([
    db.select().from(instagramAccount).where(accountsFilter),
    db.select().from(notionConnection).where(notionFilter),
    db.select().from(publishLog).where(logsFilter).orderBy(desc(publishLog.publishedAt)).limit(10),
    db
      .select({ status: publishLog.status, total: count() })
      .from(publishLog)
      .where(logsFilter)
      .groupBy(publishLog.status),
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

  // ─── Health panel + per-client aggregates ─────────────────────────────
  // These are cheap (couple of GROUP BY queries) and feed both the
  // attention panel (recent failures, inactive clients) and the agency-mode
  // per-client cards.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  const [recentFailures, lastPerClient, monthByClient] = await Promise.all([
    // Most recent failures (across scope) — drives the "needs review" item.
    db
      .select({
        id: publishLog.id,
        title: publishLog.postTitle,
        clientId: publishLog.clientId,
        platform: publishLog.platform,
        publishedAt: publishLog.publishedAt,
        error: publishLog.error,
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
  ])

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
  const isReady = notionConnected && notionHasDb && hasAccounts

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
                    return (
                      <li key={c.id} className="flex items-center gap-2 text-sm">
                        <MoonStar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span>{c.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {last ? `· última em ${last.toLocaleDateString("pt-BR")}` : "· nenhuma publicação"}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
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
                <div
                  key={c.id}
                  className={`flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors ${inactive ? "border-warning/40" : ""}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {c.logoUrl ? (
                      <img src={c.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-4 w-4" />
                      </div>
                    )}
                    <p className="font-medium truncate flex-1">{c.name}</p>
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
                </div>
              )
            })}
          </div>
        </div>
      )}

      {scope.mode === "single" && !isReady && (
        <div className="mb-8 rounded-xl border border-primary/20 border-l-4 border-l-primary bg-gradient-to-br from-primary/5 to-transparent p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Configure este cliente</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete os passos abaixo para começar a publicar para <strong>{scope.client.name}</strong>.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {!notionConnected && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/settings">
                      <BookOpen className="h-4 w-4" /> Conectar Notion
                    </Link>
                  </Button>
                )}
                {notionConnected && !notionHasDb && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/settings">
                      <BookOpen className="h-4 w-4" /> Selecionar banco de dados
                    </Link>
                  </Button>
                )}
                {!hasAccounts && (
                  <Button size="sm" asChild>
                    <Link href="/accounts">
                      <Instagram className="h-4 w-4" /> Conectar Instagram
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Agendados</CardDescription>
            <CardTitle className="font-display text-4xl font-normal text-primary">{upcomingCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">prontos para publicar</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Publicados</CardDescription>
            <CardTitle className="font-display text-4xl font-normal text-success">{totalPublished}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{statSubtitle}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com erro</CardDescription>
            <CardTitle className="font-display text-4xl font-normal text-destructive">{totalFailed}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{statSubtitle}</p>
          </CardContent>
        </Card>
      </div>

      {nextFive.length > 0 && (
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
            <div className="space-y-2">
              {nextFive.map((p) => {
                const owning = p.clientId ? clientById.get(p.clientId) : null
                return (
                  <div key={`${p.connectionId}-${p.pageId}`} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium truncate">{p.title || "Sem título"}</p>
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
                )
              })}
            </div>
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {log.status === "published" && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}
                        {log.status === "failed" && <XCircle className="h-5 w-5 shrink-0 text-destructive" />}
                        {log.status === "skipped" && <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />}
                        <div className="min-w-0">
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
                      <Badge className="shrink-0 ml-3" variant={log.status === "published" ? "success" : log.status === "failed" ? "destructive" : "secondary"}>
                        {log.status === "published" ? "Publicado" : log.status === "failed" ? "Erro" : "Ignorado"}
                      </Badge>
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
