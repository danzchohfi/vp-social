"use client"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CalendarClock, Loader2, RefreshCw, Zap, Clock, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, List, Calendar as CalendarIcon, X, XCircle, ExternalLink } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type TargetCheck = {
  raw: string
  platform: string
  tipo: string
  configured: boolean
  pageName?: string | null
}

type ScheduledPost = {
  kind: "upcoming"
  pageId: string
  title: string
  conta: string
  scheduledDate: string | null
  workspaceName?: string
  connectionId?: string
  targetChecks?: TargetCheck[]
  belongsToClient?: boolean
  contaConnected?: boolean
  notionUrl?: string
}

type PastPlatform = {
  raw: string
  status: "published" | "failed" | "skipped"
  error: string | null
  postId: string | null
  logId: string
}

type PastPost = {
  kind: "past"
  pageId: string
  title: string
  conta: string
  date: string
  connectionId: string | null
  belongsToClient: boolean
  platforms: PastPlatform[]
}

type AnyPost = ScheduledPost | PastPost
type Filter = "all" | "upcoming" | "published" | "errors"

function isPast(p: AnyPost): p is PastPost { return p.kind === "past" }
function postDate(p: AnyPost): string | null {
  return p.kind === "past" ? p.date : p.scheduledDate
}
function postPlatformsRaw(p: AnyPost): string[] {
  return p.kind === "past"
    ? p.platforms.map((pl) => pl.raw)
    : (p.targetChecks ?? []).map((c) => c.raw)
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  facebook: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  youtube: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  tiktok: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  linkedin: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
}

function platformClass(platform: string) {
  return PLATFORM_COLORS[platform.toLowerCase()] ?? "bg-muted text-muted-foreground"
}

function formatDate(iso: string | null) {
  if (!iso) return "Sem data"
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function timeUntil(iso: string | null): { label: string; isPast: boolean } {
  if (!iso) return { label: "Sem data", isPast: false }
  const diff = new Date(iso).getTime() - Date.now()
  const isPast = diff < 0
  const abs = Math.abs(diff)
  const mins = Math.floor(abs / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return { label: isPast ? `${days}d atrás` : `em ${days}d`, isPast }
  if (hours > 0) return { label: isPast ? `${hours}h atrás` : `em ${hours}h`, isPast }
  return { label: isPast ? `${mins}min atrás` : `em ${mins}min`, isPast }
}

export default function ScheduledPage() {
  const searchParams = useSearchParams()
  const focusedPostId = searchParams.get("postId")

  const [upcomingAll, setUpcomingAll] = useState<ScheduledPost[]>([])
  const [pastAll, setPastAll] = useState<PastPost[]>([])
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showOthers, setShowOthers] = useState(false)
  const [view, setView] = useState<"list" | "calendar">("list")
  const [filter, setFilter] = useState<Filter>("all")

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/notion/scheduled")
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setUpcomingAll((data.upcoming ?? data.posts ?? []).map((p: any) => ({ ...p, kind: "upcoming" as const })))
      setPastAll((data.past ?? []).map((p: any) => ({ ...p, kind: "past" as const })))
      setConfigured(data.configured ?? true)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Deep-link: when arriving via Notion's Social VP URL (?postId=X), force
  // list view (calendar wouldn't show a single highlighted card) and scroll
  // to that post's card once it has rendered.
  useEffect(() => {
    if (!focusedPostId || loading) return
    setView("list")
    const el = document.getElementById(`post-${focusedPostId}`)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.classList.add("ring-2", "ring-primary", "ring-offset-2")
    const timeout = setTimeout(() => {
      el.classList.remove("ring-2", "ring-primary", "ring-offset-2")
    }, 2400)
    return () => clearTimeout(timeout)
  }, [focusedPostId, loading, upcomingAll, pastAll])

  const now = new Date()

  function postIssues(p: ScheduledPost): string[] {
    const issues: string[] = []
    if (!p.scheduledDate) issues.push('Sem data de publicação')
    const checks = p.targetChecks ?? []
    if (checks.length === 0) {
      issues.push('Campo "Publicar em" vazio')
      if (p.conta && p.contaConnected === false) {
        issues.push(`Conta "${p.conta}" não encontrada nas contas conectadas`)
      }
    } else if (checks.every((c) => !c.configured)) {
      issues.push(`Conta "${p.conta || "—"}" não conectada em nenhuma plataforma selecionada`)
    } else {
      const unconfigured = checks.filter((c) => !c.configured)
      if (unconfigured.length > 0) {
        issues.push(`${unconfigured.length} plataforma(s) sem conta conectada: ${unconfigured.map((c) => c.raw).join(", ")}`)
      }
    }
    return issues
  }

  function willPublish(p: ScheduledPost): boolean {
    const issues = postIssues(p)
    if (issues.length > 0) return false
    const checks = p.targetChecks ?? []
    return checks.length > 0 && checks.some((c) => c.configured)
  }

  // Apply showOthers filter (only meaningful for upcoming since past entries are
  // always for the active client — they were saved when the user was scoped here)
  const upcomingScoped = showOthers ? upcomingAll : upcomingAll.filter((p) => p.belongsToClient)
  const otherPosts = upcomingAll.filter((p) => !p.belongsToClient)

  // Apply status filter
  const visibleUpcoming = filter === "published" || filter === "errors"
    ? []
    : upcomingScoped
  const visiblePast = filter === "upcoming"
    ? []
    : filter === "published"
      ? pastAll.filter((p) => p.platforms.some((pl) => pl.status === "published") && !p.platforms.some((pl) => pl.status === "failed"))
      : filter === "errors"
        ? pastAll.filter((p) => p.platforms.some((pl) => pl.status === "failed"))
        : pastAll

  const allVisible: AnyPost[] = [...visibleUpcoming, ...visiblePast]

  const hasTikTokTarget = upcomingScoped.some((p) =>
    (p.targetChecks ?? []).some((c) => c.raw?.toLowerCase().includes("tiktok"))
  )

  const willPublishPosts = upcomingScoped.filter(willPublish)
  const needsAttention = upcomingScoped.filter((p) => !willPublish(p))
  const readyNow = willPublishPosts.filter((p) => p.scheduledDate && new Date(p.scheduledDate) <= now)
  const upcomingFuture = willPublishPosts.filter((p) => p.scheduledDate && new Date(p.scheduledDate) > now)

  function groupByConta(list: ScheduledPost[]): Array<{ conta: string; posts: ScheduledPost[] }> {
    const map = new Map<string, ScheduledPost[]>()
    for (const p of list) {
      const key = p.conta || "Sem conta"
      const arr = map.get(key) ?? []
      arr.push(p)
      map.set(key, arr)
    }
    return Array.from(map.entries())
      .map(([conta, posts]) => ({ conta, posts }))
      .sort((a, b) => a.conta.localeCompare(b.conta, "pt-BR"))
  }

  const errorCount = pastAll.filter((p) => p.platforms.some((pl) => pl.status === "failed")).length
  const publishedCount = pastAll.filter((p) => p.platforms.some((pl) => pl.status === "published")).length
  const filterOptions: Array<{ value: Filter; label: string; count?: number }> = [
    { value: "all", label: "Tudo" },
    { value: "upcoming", label: "Agendados", count: upcomingScoped.length },
    { value: "published", label: "Publicados", count: publishedCount },
    { value: "errors", label: "Com erro", count: errorCount },
  ]

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Publicações</h1>
          <p className="text-muted-foreground">
            {willPublishPosts.length} prontos para publicar
            {needsAttention.length > 0 && <span className="text-warning"> · {needsAttention.length} precisam de ajustes</span>}
            {publishedCount > 0 && <span className="text-success"> · {publishedCount} publicados nos últimos 90 dias</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-card p-0.5">
            <button
              onClick={() => setView("list")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
            <button
              onClick={() => setView("calendar")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                view === "calendar" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Calendário
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Status filter */}
      <div className="mb-6 inline-flex flex-wrap gap-1 rounded-lg border bg-card p-0.5">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              filter === opt.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
            {typeof opt.count === "number" && (
              <span className={cn(
                "rounded-full px-1.5 text-[10px]",
                filter === opt.value ? "bg-background" : "bg-muted"
              )}>
                {opt.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {otherPosts.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {showOthers
              ? <>Mostrando posts de <strong className="text-foreground">todos os clientes</strong> deste workspace</>
              : <><strong className="text-foreground">{otherPosts.length}</strong> {otherPosts.length === 1 ? "post pertence" : "posts pertencem"} a outras contas/clientes neste workspace</>
            }
          </p>
          <Button variant="ghost" size="sm" onClick={() => setShowOthers((v) => !v)}>
            {showOthers ? "Ocultar de outros clientes" : "Ver todos do workspace"}
          </Button>
        </div>
      )}

      {!configured && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
          <CalendarClock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">Notion não configurado</p>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Configure a conexão com o Notion e selecione o banco de dados primeiro.
          </p>
          <Button asChild size="sm">
            <Link href="/settings">Ir para configurações</Link>
          </Button>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Erro ao buscar posts: {error}
        </div>
      )}

      {hasTikTokTarget && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <strong>TikTok em aprovação.</strong>{" "}
          Posts com TikTok não publicam automaticamente. Agende manualmente em{" "}
          <a href="https://studio.tiktok.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">
            studio.tiktok.com
          </a>
          {" "}até o app ser aprovado.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : configured && !error && allVisible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarClock className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">
              {filter === "all" && "Nenhuma publicação ainda"}
              {filter === "upcoming" && "Nenhum post agendado"}
              {filter === "published" && "Nenhuma publicação concluída"}
              {filter === "errors" && "Nenhum erro recente — tudo certo!"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === "upcoming" || filter === "all"
                ? <>Mude o status de um post para &quot;<span className="font-mono">Agendamento</span>&quot; no Notion para ele aparecer aqui.</>
                : "Histórico mostra os últimos 90 dias."}
            </p>
          </CardContent>
        </Card>
      ) : view === "calendar" ? (
        <CalendarView upcoming={visibleUpcoming} past={visiblePast} willPublish={willPublish} onPublished={load} />
      ) : (
        <div className="space-y-8">
          {/* Upcoming sections (only when filter allows) */}
          {(filter === "all" || filter === "upcoming") && readyNow.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-success">
                  Prontos para publicar agora ({readyNow.length})
                </h2>
              </div>
              <div className="space-y-6">
                {groupByConta(readyNow).map(({ conta, posts: ps }) => (
                  <ContaGroup key={`ready-${conta}`} conta={conta} posts={ps} canPublishNow onPublished={load} />
                ))}
              </div>
            </section>
          )}

          {(filter === "all" || filter === "upcoming") && upcomingFuture.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Próximas publicações ({upcomingFuture.length})
                </h2>
              </div>
              <div className="space-y-6">
                {groupByConta(upcomingFuture).map(({ conta, posts: ps }) => (
                  <ContaGroup key={`upcoming-${conta}`} conta={conta} posts={ps} />
                ))}
              </div>
            </section>
          )}

          {(filter === "all" || filter === "upcoming") && needsAttention.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-warning">
                  Não vão publicar — precisam de ajustes ({needsAttention.length})
                </h2>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Estes posts estão com status de agendamento mas o sistema não vai publicá-los até resolver os pontos abaixo.
              </p>
              <div className="space-y-6">
                {groupByConta(needsAttention).map(({ conta, posts: ps }) => (
                  <ContaGroup key={`attn-${conta}`} conta={conta} posts={ps} issuesFn={postIssues} />
                ))}
              </div>
            </section>
          )}

          {/* Past — published + failed */}
          {visiblePast.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {filter === "errors" ? "Posts com erro" : filter === "published" ? "Já publicados" : "Histórico recente"} ({visiblePast.length})
                </h2>
              </div>
              <div className="space-y-2">
                {visiblePast.map((p) => <PastPostRow key={p.pageId + p.date} post={p} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Footer link — /history is no longer in the sidebar; this is the
          way to reach the verbose log view (full 200-row table with raw
          IDs and per-platform error messages) when the 90-day grouped
          history above isn't enough. */}
      <div className="mt-12 flex justify-center border-t pt-6">
        <Link
          href="/history"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver histórico completo (todas as publicações, com IDs e erros) →
        </Link>
      </div>
    </div>
  )
}

function PastPostRow({ post }: { post: PastPost }) {
  const hasFailure = post.platforms.some((pl) => pl.status === "failed")
  const allFailed = post.platforms.every((pl) => pl.status === "failed")
  const [showErrors, setShowErrors] = useState(false)
  const errorPlatforms = post.platforms.filter((pl) => pl.status === "failed" && pl.error)

  return (
    <div
      id={`post-${post.pageId}`}
      className={cn(
        "rounded-lg border bg-card p-4 transition-shadow",
        allFailed ? "border-destructive/40 bg-destructive/5" : hasFailure ? "border-warning/40 bg-warning/5" : ""
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium truncate">{post.title || "Sem título"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{post.conta}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm text-muted-foreground">
            {new Date(post.date).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {post.platforms.map((pl) => (
          <PastPlatformBadge key={pl.logId} pl={pl} />
        ))}
        {errorPlatforms.length > 0 && (
          <button
            onClick={() => setShowErrors((v) => !v)}
            className="ml-auto text-xs text-destructive underline hover:no-underline"
          >
            {showErrors ? "Ocultar erros" : `Ver erro${errorPlatforms.length > 1 ? "s" : ""}`}
          </button>
        )}
      </div>
      {showErrors && errorPlatforms.length > 0 && (
        <div className="mt-3 space-y-2">
          {errorPlatforms.map((pl) => (
            <div key={pl.logId} className="rounded bg-destructive/10 px-3 py-2 text-xs">
              <p className="font-medium text-destructive">{pl.raw}</p>
              <p className="mt-1 text-destructive/80 break-words font-mono">{pl.error}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PastPlatformBadge({ pl }: { pl: PastPlatform }) {
  const target = pl.raw.toLowerCase()
  const platform = target.split(/[\s-]+/)[0]
  if (pl.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
        <XCircle className="h-3 w-3" />
        {pl.raw}
      </span>
    )
  }
  if (pl.status === "skipped") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {pl.raw}
        <span className="opacity-70">— ignorado</span>
      </span>
    )
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", platformClass(platform))}>
      <CheckCircle2 className="h-3 w-3" />
      {pl.raw}
    </span>
  )
}

function ContaGroup({ conta, posts, canPublishNow, onPublished, issuesFn }: { conta: string; posts: ScheduledPost[]; canPublishNow?: boolean; onPublished?: () => void; issuesFn?: (p: ScheduledPost) => string[] }) {
  const ws = posts[0]?.workspaceName
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 px-1">
        <h3 className="text-sm font-semibold">{conta}</h3>
        <span className="text-xs text-muted-foreground">
          {posts.length} post{posts.length === 1 ? "" : "s"}
          {ws && <span className="ml-2 opacity-70">· {ws}</span>}
        </span>
      </div>
      <div className="space-y-2">
        {posts.map((post) => (
          <PostRow key={post.pageId} post={post} canPublishNow={canPublishNow} onPublished={onPublished} issues={issuesFn?.(post)} />
        ))}
      </div>
    </div>
  )
}

function TargetBadge({ check }: { check: TargetCheck }) {
  const ok = check.configured
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        ok ? platformClass(check.platform) : "bg-warning/15 text-warning"
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertTriangle className="h-3 w-3 shrink-0" />}
      <span>{check.raw}</span>
      {ok && check.pageName && (
        <span className="opacity-60 before:mr-0.5 before:content-['·']">{check.pageName}</span>
      )}
      {!ok && (
        <span className="opacity-70">— sem conta</span>
      )}
    </span>
  )
}

function PostRow({ post, canPublishNow, onPublished, issues }: { post: ScheduledPost; canPublishNow?: boolean; onPublished?: () => void; issues?: string[] }) {
  const { label, isPast } = timeUntil(post.scheduledDate)
  const checks = post.targetChecks ?? []
  const noTargets = checks.length === 0
  const hasIssue = checks.some((c) => !c.configured) || noTargets
  const allMissing = checks.length > 0 && checks.every((c) => !c.configured)
  const hasIssues = (issues?.length ?? 0) > 0
  const [publishing, setPublishing] = useState(false)

  async function publishNow() {
    if (!post.connectionId) return
    if (!confirm(`Publicar "${post.title || "este post"}" agora?`)) return
    setPublishing(true)
    try {
      const res = await fetch("/api/posts/publish-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: post.pageId, connectionId: post.connectionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao publicar")
      const ok = (data.results ?? []).filter((r: any) => r.status === "published").length
      const fail = (data.results ?? []).filter((r: any) => r.status === "failed").length
      const skip = (data.results ?? []).filter((r: any) => r.status === "skipped").length
      if (ok > 0 && fail === 0) toast.success(`Publicado em ${ok} plataforma(s)!`)
      else if (ok > 0) toast.warning(`${ok} publicado(s), ${fail} falhou(aram)`)
      else toast.error(fail > 0 ? `Falha ao publicar (${fail})` : `Nenhuma plataforma publicou (${skip} ignorada(s))`)
      onPublished?.()
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e))
    } finally {
      setPublishing(false)
    }
  }

  const isOtherClient = post.belongsToClient === false
  return (
    <div
      id={`post-${post.pageId}`}
      className={cn(
        "rounded-lg border bg-card p-4 transition-shadow",
        hasIssues ? "border-warning/40 bg-warning/5" : hasIssue && "border-warning/40",
        isOtherClient && "opacity-70"
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium truncate">{post.title || "Sem título"}</p>
            {isOtherClient && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Outro cliente
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm text-muted-foreground">{formatDate(post.scheduledDate)}</p>
          {post.scheduledDate && (
            <p className={cn("text-xs font-medium", isPast ? "text-success" : "text-muted-foreground")}>
              {label}
            </p>
          )}
        </div>
      </div>

      {issues && issues.length > 0 && (
        <ul className="mt-3 space-y-1">
          {issues.map((issue) => (
            <li key={issue} className="flex items-start gap-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Publicar em:</span>
        {noTargets ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
            <AlertTriangle className="h-3 w-3" />
            Campo vazio
          </span>
        ) : (
          checks.map((c) => <TargetBadge key={c.raw} check={c} />)
        )}
        {hasIssue && !noTargets && (
          <Link href="/accounts" className="ml-1 text-xs text-warning underline">
            Configurar conta
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          {post.notionUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={post.notionUrl} target="_blank" rel="noopener noreferrer" title="Abrir no Notion">
                <ExternalLink className="h-3.5 w-3.5" />
                Ver no Notion
              </a>
            </Button>
          )}
          {canPublishNow && (
            <Button
              size="sm"
              onClick={publishNow}
              disabled={publishing || allMissing || noTargets || !post.connectionId}
              title={
                noTargets
                  ? 'Preencha o campo "Publicar em" no Notion'
                  : allMissing
                  ? "Nenhuma plataforma com conta conectada"
                  : "Publicar imediatamente"
              }
            >
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {publishing ? "Publicando..." : "Publicar agora"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Calendar view ────────────────────────────────

const WEEKDAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function CalendarView({
  upcoming, past, willPublish, onPublished,
}: {
  upcoming: ScheduledPost[]
  past: PastPost[]
  willPublish: (p: ScheduledPost) => boolean
  onPublished: () => void
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Group both kinds of posts by yyyy-mm-dd of their local date.
  const postsByDay = useMemo(() => {
    const map = new Map<string, AnyPost[]>()
    const add = (date: string | null, post: AnyPost) => {
      if (!date) return
      const key = ymd(new Date(date))
      const arr = map.get(key) ?? []
      arr.push(post)
      map.set(key, arr)
    }
    for (const p of upcoming) add(p.scheduledDate, p)
    for (const p of past) add(p.date, p)
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const da = postDate(a) ?? ""
        const db = postDate(b) ?? ""
        return new Date(da).getTime() - new Date(db).getTime()
      })
    }
    return map
  }, [upcoming, past])

  // Build the grid: weeks x 7 days, starting on Monday, covering the visible month.
  const grid = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    // JS getDay(): 0 = Sunday. We want Monday-first, so shift.
    const offset = (firstOfMonth.getDay() + 6) % 7
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const weeks = Math.ceil((offset + daysInMonth) / 7)

    const start = new Date(firstOfMonth)
    start.setDate(start.getDate() - offset)

    return Array.from({ length: weeks * 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [cursor])

  const todayKey = ymd(new Date())
  const monthLabel = `${MONTHS_PT[cursor.getMonth()]} de ${cursor.getFullYear()}`

  function shiftMonth(delta: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))
  }
  function goToday() {
    const d = new Date()
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1))
  }

  const selectedDayPosts = selectedDay ? postsByDay.get(selectedDay) ?? [] : []

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl capitalize">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={goToday}>Hoje</Button>
          <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {WEEKDAYS_PT.map((w) => (
            <div key={w} className="px-2 py-2 text-center">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((day) => {
            const key = ymd(day)
            const inMonth = day.getMonth() === cursor.getMonth()
            const isToday = key === todayKey
            const dayPosts = postsByDay.get(key) ?? []
            const visible = dayPosts.slice(0, 3)
            const overflow = dayPosts.length - visible.length
            return (
              <button
                key={key}
                onClick={() => dayPosts.length > 0 && setSelectedDay(key)}
                className={cn(
                  "min-h-[96px] border-b border-r p-1.5 text-left align-top transition-colors",
                  "[&:nth-child(7n)]:border-r-0",
                  inMonth ? "bg-card" : "bg-muted/20 text-muted-foreground/60",
                  dayPosts.length > 0 ? "hover:bg-muted/40 cursor-pointer" : "cursor-default"
                )}
              >
                <div className={cn(
                  "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium",
                  isToday && "bg-primary text-primary-foreground",
                  !isToday && !inMonth && "text-muted-foreground/50",
                )}>
                  {day.getDate()}
                </div>
                <div className="space-y-0.5">
                  {visible.map((p) => (
                    <CalendarChip key={p.kind + ":" + p.pageId} post={p} ok={p.kind === "upcoming" ? willPublish(p) : true} />
                  ))}
                  {overflow > 0 && (
                    <div className="px-1 text-[10px] font-medium text-muted-foreground">
                      +{overflow} mais
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {selectedDay && (
        <DayDrawer
          dayKey={selectedDay}
          posts={selectedDayPosts}
          onClose={() => setSelectedDay(null)}
          onPublished={() => { onPublished(); setSelectedDay(null) }}
        />
      )}
    </div>
  )
}

function CalendarChip({ post, ok }: { post: AnyPost; ok: boolean }) {
  const date = postDate(post)
  const time = date
    ? new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : ""

  if (post.kind === "past") {
    const failed = post.platforms.some((pl) => pl.status === "failed")
    const allFailed = post.platforms.every((pl) => pl.status === "failed")
    const platform = post.platforms[0]?.raw.toLowerCase().split(/[\s-]+/)[0] ?? "instagram"
    return (
      <div
        className={cn(
          "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] leading-tight",
          allFailed
            ? "bg-destructive/15 text-destructive"
            : failed
              ? "bg-warning/15 text-warning"
              : cn(platformClass(platform), "opacity-75 ring-1 ring-success/30"),
        )}
        title={post.title}
      >
        {allFailed
          ? <XCircle className="h-2.5 w-2.5 shrink-0" />
          : <CheckCircle2 className="h-2.5 w-2.5 shrink-0 opacity-70" />}
        <span className="shrink-0 font-mono text-[10px] opacity-70">{time}</span>
        <span className="truncate">{post.title || "Sem título"}</span>
      </div>
    )
  }

  const platform = post.targetChecks?.[0]?.platform ?? "instagram"
  return (
    <div
      className={cn(
        "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] leading-tight",
        ok ? platformClass(platform) : "bg-warning/15 text-warning"
      )}
      title={post.title}
    >
      <span className="shrink-0 font-mono text-[10px] opacity-70">{time}</span>
      <span className="truncate">{post.title || "Sem título"}</span>
    </div>
  )
}

function DayDrawer({
  dayKey, posts, onClose, onPublished,
}: {
  dayKey: string
  posts: AnyPost[]
  onClose: () => void
  onPublished: () => void
}) {
  const [y, m, d] = dayKey.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const label = date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-xl border bg-background p-4 sm:rounded-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Agenda do dia</p>
            <h3 className="font-display text-xl capitalize">{label}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {posts.map((post) => {
            if (post.kind === "past") {
              return <PastPostRow key={"past:" + post.pageId + post.date} post={post} />
            }
            const dueNow = post.scheduledDate && new Date(post.scheduledDate) <= new Date()
            return (
              <PostRow
                key={"upcoming:" + post.pageId}
                post={post}
                canPublishNow={!!dueNow}
                onPublished={onPublished}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
