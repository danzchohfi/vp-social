import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { fieldMapping, instagramAccount, notionConnection, publishLog } from "@/lib/db/schema"
import { eq, desc, count, inArray } from "drizzle-orm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Instagram, BookOpen, CheckCircle2, XCircle, Clock, Zap, ArrowRight, Facebook, Youtube, Linkedin, CalendarClock, LayoutGrid, Building2 } from "lucide-react"
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
  const upcoming = await fetchUpcomingForConnections(notion).catch(() => [])
  const upcomingCount = upcoming.length
  const nextFive = upcoming.slice(0, 5)

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

      {scope.mode === "all" && (
        <div className="mb-8 rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clientes ({scope.clients.length})</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {scope.clients.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-1 text-xs">
                {c.logoUrl ? (
                  <img src={c.logoUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
                ) : (
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                )}
                {c.name}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Para publicar ou configurar um cliente específico, troque para ele no menu lateral.
          </p>
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
