"use client"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CalendarClock, Loader2, RefreshCw, Zap, Clock, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, List, Calendar as CalendarIcon, X, XCircle, ExternalLink, Eye, Play, MessageCircle, Copy, ThumbsUp, ThumbsDown, MessageSquareWarning } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { PostRowSkeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"

type TargetCheck = {
  raw: string
  platform: string
  tipo: string
  configured: boolean
  pageName?: string | null
}

type ApprovalState = {
  // "no_link" = post is in awaiting-approval status but no approval_link
  // row exists yet (cron hasn't run, or contact resolve failed). UI soft-warns.
  state: "pending" | "stale" | "decided" | "expired" | "no_link"
  token?: string | null
  decision?: "approved" | "rejected" | "revision" | null
  comment?: string | null
  sentVia?: "meta_cloud" | "manual" | "invalid_phone" | "none" | null
  sentAt?: string | null
  decidedAt?: string | null
  expiresAt?: string | null
  contactName?: string | null
  contactPhone?: string | null
  // Human-readable cause when the auto-dispatch didn't fire / failed.
  // Populated by the cron and by /api/clients/[id]/notify-pending.
  lastError?: string | null
  approvalUrl?: string | null
  // Per-client wa.me message template — used by the "Enviar via WA"
  // button to fill in {{contact_name}} {{post_title}} {{approval_url}}
  // {{client_name}}. NULL = use the hardcoded default.
  manualWaTemplate?: string | null
  ownerClientName?: string | null
}

type ScheduledPost = {
  kind: "upcoming"
  pageId: string
  title: string
  conta: string
  scheduledDate: string | null
  workspaceName?: string
  connectionId?: string
  // "ready" = status maps to mapping.statusReadyValue (Agendamento). The cron
  // will publish at scheduledDate. "awaiting" = status equals
  // mapping.awaitingApprovalValue (Aguardando aprovação). The cron creates
  // an approval link instead and publishes only after the client approves.
  workflowState?: "ready" | "awaiting"
  // Raw status value from Notion (from approvalStatusField when set,
  // else statusField). Lets the row display the exact stage label
  // configured in the agency's workspace.
  notionStatus?: string | null
  approval?: ApprovalState | null
  // Agency-view metadata (only present when /api/notion/scheduled is in
  // mode: "all"). Used to render a small client badge per row.
  clientId?: string | null
  clientName?: string | null
  clientLogoUrl?: string | null
  targetChecks?: TargetCheck[]
  belongsToClient?: boolean
  contaConnected?: boolean
  notionUrl?: string
  // Media + caption — used by the Preview dialog.
  feedImageUrls?: string[]
  verticalUrls?: string[]
  horizontalUrls?: string[]
  thumbnailUrl?: string | null
  fullCaption?: string
  caption?: string
  // Populated when this Notion page also has rows in publish_log within the
  // 90-day window (typical after a partial failure: IG ✓, FB ✗ → status
  // flipped back to ready). Surfaces inline so we don't render the same
  // post twice (one upcoming card + one past card). The cron's idempotency
  // pre-check skips platforms that already succeeded, so retry is safe.
  priorAttempts?: PastPlatform[]
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
  clientId?: string | null
  clientName?: string | null
  clientLogoUrl?: string | null
  belongsToClient: boolean
  platforms: PastPlatform[]
}

type AnyPost = ScheduledPost | PastPost
type Filter = "all" | "upcoming" | "approval" | "published" | "errors"
// Each detected problem on a scheduled post pairs the human-readable label
// with an inline "fix it" action so the user is one click from resolving.
type PostIssue = {
  message: string
  actionLabel: string
  actionHref: string
  // Notion links open in a new tab; in-app links navigate normally.
  actionExternal?: boolean
}

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
  const [ignored, setIgnored] = useState<Array<{ pageId: string; title: string; conta: string; clientName: string | null; suggestion: string | null }>>([])
  const [statusBreakdown, setStatusBreakdown] = useState<Array<{ value: string; count: number }>>([])
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agencyMode, setAgencyMode] = useState(false)
  const [view, setView] = useState<"list" | "calendar">("calendar")
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
      setIgnored(Array.isArray(data.ignored) ? data.ignored : [])
      setStatusBreakdown(Array.isArray(data.statusBreakdown) ? data.statusBreakdown : [])
      setConfigured(data.configured ?? true)
      setAgencyMode(!!data.agencyMode)
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

  // Issue with an inline "fix it" action so the user is one click from
  // resolving the problem (Notion card / accounts page) instead of having
  // to figure out what to do.
  function postIssues(p: ScheduledPost): PostIssue[] {
    const issues: PostIssue[] = []
    if (!p.scheduledDate) {
      issues.push({
        message: "Sem data de publicação",
        actionLabel: "Definir no Notion",
        actionHref: p.notionUrl || `https://www.notion.so/${p.pageId.replace(/-/g, "")}`,
        actionExternal: true,
      })
    }
    const checks = p.targetChecks ?? []
    if (checks.length === 0) {
      issues.push({
        message: 'Campo "Publicar em" vazio',
        actionLabel: "Definir no Notion",
        actionHref: p.notionUrl || `https://www.notion.so/${p.pageId.replace(/-/g, "")}`,
        actionExternal: true,
      })
      if (p.conta && p.contaConnected === false) {
        issues.push({
          message: `Conta "${p.conta}" não conectada`,
          actionLabel: "Conectar conta",
          actionHref: "/accounts",
        })
      }
    } else if (checks.every((c) => !c.configured)) {
      issues.push({
        message: `Conta "${p.conta || "—"}" não conectada em nenhuma plataforma selecionada`,
        actionLabel: "Conectar conta",
        actionHref: "/accounts",
      })
    } else {
      const unconfigured = checks.filter((c) => !c.configured)
      if (unconfigured.length > 0) {
        issues.push({
          message: `Sem conta conectada para: ${unconfigured.map((c) => c.raw).join(", ")}`,
          actionLabel: "Conectar conta",
          actionHref: "/accounts",
        })
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

  // The API already filters out posts whose `conta` isn't connected in this
  // view (single client or agency). What arrives here is what should show.
  //
  // Merge step: when a Notion page has both an active ready/awaiting status
  // (upcoming) AND prior publish_log rows (past), we collapse them into ONE
  // upcoming card with priorAttempts attached. Common case: partial failure
  // where IG published but FB failed; status went to Erro then user clicked
  // "Tentar novamente" → status back to Agendado, so the post is in upcoming
  // again WHILE the failed log row still exists in past. Without the merge
  // calendar/list show two cards for the same Notion page.
  const upcomingPageIds = new Set(upcomingAll.map((p) => p.pageId))
  const upcomingMerged: ScheduledPost[] = upcomingAll.map((p) => {
    const prior = pastAll.find((x) => x.pageId === p.pageId)
    return prior ? { ...p, priorAttempts: prior.platforms } : p
  })
  const standalonePast = pastAll.filter((p) => !upcomingPageIds.has(p.pageId))

  // Posts in awaiting-approval state get their own bucket above the
  // ready ones — they don't publish until the client approves, and the
  // typical agency workflow needs to know which ones are still waiting
  // (vs stale, vs decided). Filter chip "Aprovação" narrows to this bucket.
  const awaitingApproval = upcomingMerged.filter((p) => p.workflowState === "awaiting")
  const readyScoped = upcomingMerged.filter((p) => p.workflowState !== "awaiting")

  // Apply status filter. "errors" pulls from BOTH buckets: posts still in
  // upcoming with failed prior attempts AND standalone past with failures.
  const baseUpcoming =
    filter === "published"
      ? []
      : filter === "errors"
      ? upcomingMerged.filter((p) => p.priorAttempts?.some((pl) => pl.status === "failed"))
      : filter === "approval"
      ? awaitingApproval
      : upcomingMerged
  // Then apply the optional Notion-status chip filter on top.
  const visibleUpcoming = statusFilter
    ? baseUpcoming.filter((p) => (p.notionStatus ?? "").trim() === statusFilter)
    : baseUpcoming
  const visiblePast =
    filter === "upcoming" || filter === "approval"
      ? []
      : filter === "published"
      ? standalonePast.filter((p) => p.platforms.some((pl) => pl.status === "published") && !p.platforms.some((pl) => pl.status === "failed"))
      : filter === "errors"
      ? standalonePast.filter((p) => p.platforms.some((pl) => pl.status === "failed"))
      : standalonePast

  const allVisible: AnyPost[] = [...visibleUpcoming, ...visiblePast]

  const hasTikTokTarget = upcomingMerged.some((p) =>
    (p.targetChecks ?? []).some((c) => c.raw?.toLowerCase().includes("tiktok"))
  )

  const willPublishPosts = readyScoped.filter(willPublish)
  const needsAttention = readyScoped.filter((p) => !willPublish(p))
  const readyNow = willPublishPosts.filter((p) => p.scheduledDate && new Date(p.scheduledDate) <= now)
  const upcomingFuture = willPublishPosts.filter((p) => p.scheduledDate && new Date(p.scheduledDate) > now)
  const staleApprovals = awaitingApproval.filter((p) => p.approval?.state === "stale" || p.approval?.state === "expired" || p.approval?.state === "no_link").length

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
  const filterOptions: Array<{ value: Filter; label: string; count?: number; warn?: number }> = [
    { value: "all", label: "Tudo" },
    { value: "upcoming", label: "Agendados", count: readyScoped.length },
    { value: "approval", label: "Aguardando aprovação", count: awaitingApproval.length, warn: staleApprovals },
    { value: "published", label: "Publicados", count: publishedCount },
    { value: "errors", label: "Com erro", count: errorCount },
  ]

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title={
          <span className="flex flex-wrap items-baseline gap-2">
            Publicações
            {agencyMode && (
              <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-sm font-medium text-primary">
                Visão agência · todos os clientes
              </span>
            )}
          </span>
        }
        subtitle={
          <>
            {willPublishPosts.length} prontos para publicar
            {awaitingApproval.length > 0 && (
              <span className={cn(staleApprovals > 0 ? "text-warning" : "text-muted-foreground")}>
                {" · "}{awaitingApproval.length} aguardando aprovação
                {staleApprovals > 0 && <> ({staleApprovals} parada{staleApprovals > 1 ? "s" : ""} há +3d)</>}
              </span>
            )}
            {needsAttention.length > 0 && <span className="text-warning"> · {needsAttention.length} precisam de ajustes</span>}
            {publishedCount > 0 && <span className="text-success"> · {publishedCount} publicados nos últimos 90 dias</span>}
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border bg-card p-0.5">
              <button
                onClick={() => setView("list")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                  view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="h-3.5 w-3.5" />
                Lista
              </button>
              <button
                onClick={() => setView("calendar")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
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
        }
      />

      {/* Status filter */}
      <div className="mb-6 inline-flex flex-wrap gap-1 rounded-lg border bg-card p-0.5">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors",
              filter === opt.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
            {typeof opt.count === "number" && (
              <span className={cn(
                "rounded-full px-1.5 text-[12px]",
                filter === opt.value ? "bg-background" : "bg-muted"
              )}>
                {opt.count}
              </span>
            )}
            {/* Stale-approval warning dot — surfaces "agency needs to chase the
                client" without forcing the user to enter the chip first. */}
            {typeof opt.warn === "number" && opt.warn > 0 && (
              <span
                className="inline-flex h-1.5 w-1.5 rounded-full bg-warning"
                title={`${opt.warn} aprovação${opt.warn > 1 ? "ões" : ""} parada${opt.warn > 1 ? "s" : ""} há mais de 3 dias`}
              />
            )}
          </button>
        ))}
      </div>

      {/* Notion status breakdown — chips showing each distinct status
          value (read from approvalStatusField || statusField) with
          counts. Click to filter the list. Visible only when there's
          status data to surface. */}
      {statusBreakdown.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted-foreground">Status no Notion:</span>
          {statusFilter && (
            <button
              onClick={() => setStatusFilter(null)}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-sm font-medium text-primary hover:bg-primary/20"
              title="Limpar filtro por status"
            >
              <X className="h-3 w-3" />
              {statusFilter}
            </button>
          )}
          {!statusFilter && statusBreakdown.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-sm hover:bg-accent"
              title={`Filtrar por "${s.value}"`}
            >
              <span>{s.value}</span>
              <span className="rounded-full bg-muted px-1.5 text-[12px] font-medium text-muted-foreground">{s.count}</span>
            </button>
          ))}
        </div>
      )}

      {!configured && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
          <CalendarClock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">Notion não configurado</p>
          <p className="mt-1 mb-4 text-base text-muted-foreground">
            Configure a conexão com o Notion e selecione o banco de dados primeiro.
          </p>
          <Button asChild size="sm">
            <Link href="/settings">Ir para configurações</Link>
          </Button>
        </div>
      )}

      {ignored.length > 0 && (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/5 p-4 sm:p-5">
          <div className="mb-2 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="text-base font-semibold">
                {ignored.length} {ignored.length === 1 ? "post ignorado" : "posts ignorados"}
              </p>
              <p className="text-sm text-muted-foreground">
                A conta no Notion não bate com nenhuma cadastrada — o sistema não vai publicar esses posts até resolver. Sugestões abaixo ↓
              </p>
            </div>
          </div>
          <ul className="mt-2 space-y-1.5">
            {ignored.slice(0, 8).map((p) => (
              <li key={p.pageId} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded border bg-card px-3 py-2 text-base">
                <span className="font-medium truncate">{p.title || "Sem título"}</span>
                {p.clientName && (
                  <span className="text-[12px] text-muted-foreground">· {p.clientName}</span>
                )}
                <span className="text-sm text-muted-foreground">
                  Notion diz <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">{p.conta}</code>
                </span>
                {p.suggestion ? (
                  <span className="text-sm">
                    — quis dizer <code className="rounded bg-success/15 px-1 py-0.5 font-mono text-[13px] text-success">{p.suggestion}</code>?
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">— sem conta parecida cadastrada</span>
                )}
              </li>
            ))}
            {ignored.length > 8 && (
              <li className="text-sm text-muted-foreground">+ {ignored.length - 8} outros</li>
            )}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href="/accounts" className="text-warning underline hover:no-underline">
              Editar contas conectadas →
            </Link>
            <span className="text-muted-foreground">ou troque o valor da propriedade <strong>Conta</strong> no Notion.</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-base text-destructive">
          Erro ao buscar posts: {error}
        </div>
      )}

      {hasTikTokTarget && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-base text-warning">
          <strong>TikTok em aprovação.</strong>{" "}
          Posts com TikTok não publicam automaticamente. Agende manualmente em{" "}
          <a href="https://studio.tiktok.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">
            studio.tiktok.com
          </a>
          {" "}até o app ser aprovado.
        </div>
      )}

      {loading ? (
        <PostRowSkeleton count={4} />
      ) : configured && !error && allVisible.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          tone={filter === "errors" ? "success" : "neutral"}
          title={
            filter === "all" ? "Nenhuma publicação ainda"
            : filter === "upcoming" ? "Nenhum post agendado"
            : filter === "published" ? "Nenhuma publicação concluída"
            : "Nenhum erro recente — tudo certo!"
          }
          description={
            filter === "upcoming" || filter === "all"
              ? "Mude o status de um post para \"Agendamento\" no Notion para ele aparecer aqui."
              : "Histórico mostra os últimos 90 dias."
          }
        />
      ) : view === "calendar" ? (
        <CalendarView upcoming={visibleUpcoming} past={visiblePast} willPublish={willPublish} onPublished={load} />
      ) : (
        <div className="space-y-8">
          {/* Awaiting-approval section — shown above the publish-ready ones
              because the agency needs to chase stale ones (3d+ no decision)
              before they hold up the calendar. */}
          {(filter === "all" || filter === "approval") && awaitingApproval.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-amber-500" />
                <h2 className="text-base font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Aguardando aprovação ({awaitingApproval.length})
                </h2>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                Posts que estão no status &quot;aguardando aprovação&quot; no Notion. O cliente recebe link via WhatsApp; quando aprovar, o post entra no fluxo normal.
              </p>
              <div className="space-y-6">
                {groupByConta(awaitingApproval).map(({ conta, posts: ps }) => (
                  <ContaGroup key={`approval-${conta}`} conta={conta} posts={ps} onPublished={load} />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming sections (only when filter allows) */}
          {(filter === "all" || filter === "upcoming") && readyNow.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <h2 className="text-base font-semibold uppercase tracking-wider text-success">
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
                <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground">
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
                <h2 className="text-base font-semibold uppercase tracking-wider text-warning">
                  Não vão publicar — precisam de ajustes ({needsAttention.length})
                </h2>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground">
                    {filter === "errors" ? "Posts com erro" : filter === "published" ? "Já publicados" : "Histórico recente"} ({visiblePast.length})
                  </h2>
                </div>
                {/* Bulk retry — only meaningful when viewing errors. Wraps
                    individual retry calls in Promise.allSettled so a single
                    Notion 5xx doesn't abort the rest. */}
                {filter === "errors" && visiblePast.length > 1 && (
                  <BulkRetryButton posts={visiblePast} onDone={load} />
                )}
              </div>
              <div className="space-y-2">
                {visiblePast.map((p) => <PastPostRow key={p.pageId + p.date} post={p} onRetried={load} />)}
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
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver histórico completo (todas as publicações, com IDs e erros) →
        </Link>
      </div>
    </div>
  )
}

// Bulk retry: re-flips every visible failed post back to "ready" status
// in Notion. Wraps individual /api/posts/retry calls in Promise.allSettled
// so one Notion 5xx doesn't abort the rest. Cron picks them up on next
// tick — duplicates physically impossible thanks to the partial unique
// index from PR #3 (publish_log_inflight_uniq).
function BulkRetryButton({ posts, onDone }: { posts: PastPost[]; onDone: () => void }) {
  const [retrying, setRetrying] = useState(false)

  // Only retry posts that have at least one failed platform AND a
  // connectionId (older logs without one can't be retried).
  const retryable = posts.filter((p) => p.connectionId && p.platforms.some((pl) => pl.status === "failed"))
  if (retryable.length === 0) return null

  async function bulkRetry() {
    if (!confirm(`Reagendar ${retryable.length} post(s) com erro pra tentar novamente? O cron vai pegar no próximo tick (até 5min).`)) return
    setRetrying(true)
    try {
      const results = await Promise.allSettled(
        retryable.map((p) =>
          fetch("/api/posts/retry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pageId: p.pageId, connectionId: p.connectionId }),
          }),
        ),
      )
      const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length
      const successes = retryable.length - failures
      if (failures === 0) {
        toast.success(`${successes} post(s) reagendados — aguarde o próximo tick do cron`)
      } else if (successes > 0) {
        toast.warning(`${successes} reagendados, ${failures} falharam — confira o log`)
      } else {
        toast.error("Nada foi reagendado — confira o log")
      }
      onDone()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={bulkRetry} disabled={retrying}>
      {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      Tentar novamente todos ({retryable.length})
    </Button>
  )
}

function PastPostRow({ post, onRetried }: { post: PastPost; onRetried?: () => void }) {
  const hasFailure = post.platforms.some((pl) => pl.status === "failed")
  const allFailed = post.platforms.every((pl) => pl.status === "failed")
  const [showErrors, setShowErrors] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewPost, setPreviewPost] = useState<ScheduledPost | null>(null)
  const errorPlatforms = post.platforms.filter((pl) => pl.status === "failed" && pl.error)

  async function loadPreview() {
    if (!post.connectionId) return
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/notion/post-detail?pageId=${encodeURIComponent(post.pageId)}&connectionId=${encodeURIComponent(post.connectionId)}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao carregar preview")
        return
      }
      // Build a synthetic ScheduledPost shape so the existing PreviewDialog
      // can render. Past entries in publishLog are per-platform; we surface
      // the published platforms as targetChecks so the dialog shows one card
      // per platform with its real media.
      setPreviewPost({
        kind: "upcoming",
        pageId: data.post.pageId,
        title: data.post.title,
        conta: data.post.conta,
        scheduledDate: data.post.scheduledDate,
        notionUrl: data.post.notionUrl,
        feedImageUrls: data.post.feedImageUrls,
        verticalUrls: data.post.verticalUrls,
        horizontalUrls: data.post.horizontalUrls,
        thumbnailUrl: data.post.thumbnailUrl,
        fullCaption: data.post.fullCaption,
        caption: data.post.caption,
        targetChecks: post.platforms.map((pl) => {
          const platform = pl.raw.toLowerCase().split(/[\s-]+/)[0]
          // Derive a coarse `tipo` from the raw target so the dialog picks
          // the right aspect ratio.
          const lower = pl.raw.toLowerCase()
          const tipo = lower.includes("reel") ? "reel"
            : lower.includes("story") ? "story"
            : lower.includes("short") ? "youtube short"
            : lower.includes("youtube") ? "youtube"
            : lower.includes("carrossel") || lower.includes("carousel") ? "carrossel"
            : "feed"
          return { raw: pl.raw, platform, tipo, configured: pl.status === "published", pageName: null }
        }),
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar preview")
    } finally {
      setPreviewLoading(false)
    }
  }

  async function retry() {
    if (!post.connectionId) return
    const failedNames = post.platforms.filter((pl) => pl.status === "failed").map((pl) => pl.raw)
    const publishedNames = post.platforms.filter((pl) => pl.status === "published").map((pl) => pl.raw)
    let msg = `Reagendar "${post.title || "este post"}" para tentar novamente?`
    if (failedNames.length > 0) msg += `\n\nVai retentar apenas em: ${failedNames.join(", ")}.`
    if (publishedNames.length > 0) msg += `\nJá publicado em ${publishedNames.join(", ")} — será pulado para evitar duplicação.`
    if (!confirm(msg)) return
    setRetrying(true)
    try {
      const res = await fetch("/api/posts/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: post.pageId, connectionId: post.connectionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao reagendar")
      toast.success("Post reagendado — vai publicar no próximo ciclo (até 5 min)")
      onRetried?.()
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e))
    } finally {
      setRetrying(false)
    }
  }

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
          <div className="flex flex-wrap items-center gap-2">
            {post.pageId ? (
              <a
                href={`https://www.notion.so/${post.pageId.replace(/-/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir no Notion"
                className="group inline-flex items-center gap-1.5 min-w-0 font-medium hover:underline"
              >
                <span className="truncate">{post.title || "Sem título"}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
              </a>
            ) : (
              <p className="font-medium truncate">{post.title || "Sem título"}</p>
            )}
            {post.clientName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">
                {post.clientLogoUrl ? (
                  <img src={post.clientLogoUrl} alt="" className="h-3 w-3 rounded-full object-cover" />
                ) : null}
                {post.clientName}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{post.conta}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base text-muted-foreground">
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {errorPlatforms.length > 0 && (
            <button
              onClick={() => setShowErrors((v) => !v)}
              className="text-sm text-destructive underline hover:no-underline"
            >
              {showErrors ? "Ocultar erros" : `Ver erro${errorPlatforms.length > 1 ? "s" : ""}`}
            </button>
          )}
          {post.connectionId && (
            <Button size="sm" variant="outline" onClick={loadPreview} disabled={previewLoading} title="Ver mídia e legenda do post">
              {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Preview
            </Button>
          )}
          {hasFailure && post.connectionId && (
            <Button
              size="sm"
              variant="outline"
              onClick={retry}
              disabled={retrying}
              title="Reagendar para o cron tentar publicar novamente"
            >
              {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {retrying ? "Reagendando..." : "Tentar novamente"}
            </Button>
          )}
        </div>
      </div>
      {showErrors && errorPlatforms.length > 0 && (
        <div className="mt-3 space-y-2">
          {errorPlatforms.map((pl) => (
            <div key={pl.logId} className="rounded bg-destructive/10 px-3 py-2 text-sm">
              <p className="font-medium text-destructive">{pl.raw}</p>
              <p className="mt-1 text-destructive/80 break-words font-mono">{pl.error}</p>
            </div>
          ))}
        </div>
      )}
      {previewPost && <PreviewDialog post={previewPost} onClose={() => setPreviewPost(null)} />}
    </div>
  )
}

function PastPlatformBadge({ pl }: { pl: PastPlatform }) {
  const target = pl.raw.toLowerCase()
  const platform = target.split(/[\s-]+/)[0]
  if (pl.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-sm font-medium text-destructive">
        <XCircle className="h-3 w-3" />
        {pl.raw}
      </span>
    )
  }
  if (pl.status === "skipped") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm font-medium text-muted-foreground">
        {pl.raw}
        <span className="opacity-70">— ignorado</span>
      </span>
    )
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium", platformClass(platform))}>
      <CheckCircle2 className="h-3 w-3" />
      {pl.raw}
    </span>
  )
}

function ContaGroup({ conta, posts, canPublishNow, onPublished, issuesFn }: { conta: string; posts: ScheduledPost[]; canPublishNow?: boolean; onPublished?: () => void; issuesFn?: (p: ScheduledPost) => PostIssue[] }) {
  const ws = posts[0]?.workspaceName
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 px-1">
        <h3 className="text-base font-semibold">{conta}</h3>
        <span className="text-sm text-muted-foreground">
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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium",
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

function PostRow({ post, canPublishNow, onPublished, issues }: { post: ScheduledPost; canPublishNow?: boolean; onPublished?: () => void; issues?: PostIssue[] }) {
  const { label, isPast } = timeUntil(post.scheduledDate)
  const checks = post.targetChecks ?? []
  const noTargets = checks.length === 0
  const hasIssue = checks.some((c) => !c.configured) || noTargets
  const allMissing = checks.length > 0 && checks.every((c) => !c.configured)
  const hasIssues = (issues?.length ?? 0) > 0
  const [publishing, setPublishing] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [showPriorErrors, setShowPriorErrors] = useState(false)

  const priorAttempts = post.priorAttempts ?? []
  const failedAttempts = priorAttempts.filter((pl) => pl.status === "failed")
  const publishedAttempts = priorAttempts.filter((pl) => pl.status === "published")
  const hasFailedHistory = failedAttempts.length > 0
  const hasPublishedHistory = publishedAttempts.length > 0

  async function publishNow() {
    if (!post.connectionId) return
    let confirmMsg = `Publicar "${post.title || "este post"}" agora?`
    if (priorAttempts.length > 0) {
      confirmMsg = `Tentar novamente "${post.title || "este post"}" agora?`
      if (hasFailedHistory) {
        confirmMsg += `\n\nVai retentar apenas em: ${failedAttempts.map((p) => p.raw).join(", ")}.`
      }
      if (hasPublishedHistory) {
        confirmMsg += `\nJá publicado em ${publishedAttempts.map((p) => p.raw).join(", ")} — será pulado para evitar duplicação.`
      }
    }
    if (!confirm(confirmMsg)) return
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
  // Left-border accent + soft background tint per workflow state.
  // Cuts the sea-of-gray feel and lets the user scan status at a
  // glance: amber=awaiting client, blue=scheduled to publish.
  // hasIssues (warning border) still overrides — it's the higher
  // priority signal.
  const stateAccent = hasIssues
    ? "border-l-4 border-l-warning/60 bg-warning/[0.04]"
    : post.workflowState === "awaiting"
      ? "border-l-4 border-l-warning/40 bg-warning/[0.02]"
      : post.workflowState === "ready"
        ? "border-l-4 border-l-primary/30"
        : ""

  return (
    <div
      id={`post-${post.pageId}`}
      className={cn(
        "rounded-lg border bg-card p-4 transition-shadow",
        stateAccent,
        hasIssue && !stateAccent && "border-warning/40",
        isOtherClient && "opacity-70"
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {post.notionUrl ? (
              <a
                href={post.notionUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir no Notion"
                className="group inline-flex items-center gap-1.5 min-w-0 font-medium hover:underline"
              >
                <span className="truncate">{post.title || "Sem título"}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
              </a>
            ) : (
              <p className="font-medium truncate">{post.title || "Sem título"}</p>
            )}
            {/* Client chip — only shown in agency view (clientName present). */}
            {post.clientName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">
                {post.clientLogoUrl ? (
                  <img src={post.clientLogoUrl} alt="" className="h-3 w-3 rounded-full object-cover" />
                ) : null}
                {post.clientName}
              </span>
            )}
            {/* Notion status pill — shows the exact stage value from the
                agency's Notion workspace (approvalStatusField || statusField).
                Distinct from approval state (decided/pending) — this is the
                production-side label. */}
            {post.notionStatus && (
              <span
                className="inline-flex items-center rounded-full border bg-muted/40 px-2 py-0.5 text-[12px] font-medium text-muted-foreground"
                title="Status no Notion"
              >
                {post.notionStatus}
              </span>
            )}
            {isOtherClient && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Outro cliente
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base text-muted-foreground">{formatDate(post.scheduledDate)}</p>
          {post.scheduledDate && (
            <p className={cn("text-sm font-medium", isPast ? "text-success" : "text-muted-foreground")}>
              {label}
            </p>
          )}
        </div>
      </div>

      {post.approval && <ApprovalBanner post={post} approval={post.approval} onAction={onPublished} />}

      {issues && issues.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {issues.map((issue) => (
            <li key={issue.message} className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm text-warning">
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{issue.message}</span>
              </span>
              {issue.actionExternal ? (
                <a
                  href={issue.actionHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-5 inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[13px] font-medium text-warning hover:bg-warning/20"
                >
                  {issue.actionLabel}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <Link
                  href={issue.actionHref}
                  className="ml-5 inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[13px] font-medium text-warning hover:bg-warning/20"
                >
                  {issue.actionLabel}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-sm text-muted-foreground">Publicar em:</span>
        {noTargets ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-sm font-medium text-warning">
            <AlertTriangle className="h-3 w-3" />
            Campo vazio
          </span>
        ) : (
          checks.map((c) => <TargetBadge key={c.raw} check={c} />)
        )}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)} title="Ver como o post vai sair em cada plataforma">
            <Eye className="h-3.5 w-3.5" />
            Preview
          </Button>
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
                  : hasFailedHistory
                  ? "Retentar apenas nas plataformas que falharam"
                  : "Publicar imediatamente"
              }
            >
              {publishing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : hasFailedHistory ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              {publishing ? "Publicando..." : hasFailedHistory ? "Tentar novamente" : "Publicar agora"}
            </Button>
          )}
        </div>
      </div>

      {/* Histórico de tentativas — aparece quando o Notion ainda tem o post
          como agendado mas o publish_log já tem rows pra essa página. Mostra
          status por plataforma + erro expansível. O cron tem pre-check anti-
          duplicação (publish.ts:180-198): plataformas com row 'published'
          são puladas no próximo ciclo, então o botão acima é seguro. */}
      {priorAttempts.length > 0 && (
        <div className="mt-3 rounded-md border border-dashed border-warning/40 bg-warning/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Tentativas anteriores
            </p>
            {hasFailedHistory && (
              <button
                onClick={() => setShowPriorErrors((v) => !v)}
                className="text-sm text-destructive underline hover:no-underline"
              >
                {showPriorErrors ? "Ocultar erros" : `Ver erro${failedAttempts.length > 1 ? "s" : ""}`}
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {priorAttempts.map((pl) => <PastPlatformBadge key={pl.logId} pl={pl} />)}
          </div>
          {hasPublishedHistory && (
            <p className="mt-2 text-[13px] text-muted-foreground">
              Já publicado em {publishedAttempts.map((p) => p.raw).join(", ")} — não vai republicar para evitar duplicação.
            </p>
          )}
          {showPriorErrors && hasFailedHistory && (
            <div className="mt-2 space-y-2">
              {failedAttempts.map((pl) => (
                <div key={pl.logId} className="rounded bg-destructive/10 px-3 py-2 text-sm">
                  <p className="font-medium text-destructive">{pl.raw}</p>
                  <p className="mt-1 text-destructive/80 break-words font-mono">{pl.error}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {previewOpen && <PreviewDialog post={post} onClose={() => setPreviewOpen(false)} />}
    </div>
  )
}

// ─── Approval banner ────────────────────────────────
// Surfaces the lifecycle of an approval_link row (pending / stale /
// decided / expired / no_link) inline on the post card. Owners use this
// to know whether they need to chase the client (stale, expired, no_link)
// or just wait. Click "Reenviar WA" → wa.me deep-link with pre-filled msg
// referencing the original token. Click "Copiar link" → puts the approval
// URL on the clipboard (handy when the auto dispatch failed but they have
// another channel to send it).

function ApprovalBanner({
  post,
  approval,
  onAction,
}: {
  post: ScheduledPost
  approval: ApprovalState
  onAction?: () => void
}) {
  const [resending, setResending] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [dispatching, setDispatching] = useState(false)

  // Dispatch WhatsApp for this SPECIFIC approval link. Different from
  // triggerNow (which creates the link first via the admin sweep) —
  // this assumes the link exists and just re-runs the send. Useful
  // when notify-pending picked a different post and the agency wants
  // to target THIS one specifically. /api/approve/[token]/dispatch.
  async function dispatchThisPost() {
    if (!approval?.token || dispatching) return
    setDispatching(true)
    try {
      const res = await fetch(`/api/approve/${approval.token}/dispatch`, { method: "POST" })
      const data = await res.json()
      if (data?.ok) {
        toast.success(`WhatsApp enviado pra ${data.contactName ?? data.phone}`)
        if (typeof onAction === "function") onAction()
      } else {
        toast.error(data?.reason ?? "Falha no disparo")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setDispatching(false)
    }
  }

  // Force-create the approvalLink + dispatch WhatsApp for this one post,
  // bypassing the 5-min cron wait. Used when the post just transitioned
  // to "aguardando aprovação" and the agency wants the link out NOW.
  // Reuses the admin test-approval-sweep endpoint with dispatch=true.
  async function triggerNow() {
    if (!post.connectionId) {
      toast.error("Post sem connection do Notion — não dá pra disparar")
      return
    }
    setTriggering(true)
    try {
      const res = await fetch("/api/admin/test-approval-sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: post.pageId, connectionId: post.connectionId, dispatch: true }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? "Falha ao disparar")
      if (data?.dispatch?.ok) toast.success("WhatsApp disparado")
      else if (data?.approvalLink?.approvalUrl) toast.success("Link criado — use o botão WA pra enviar")
      else toast.warning("Link criado mas o WA falhou — veja o painel do cliente")
      onAction?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setTriggering(false)
    }
  }

  // Visual treatment per state. "decided" intentionally renders even after
  // the agency moves the post forward — it lets them see "approved 4h ago"
  // until the post leaves awaiting status (next cron tick).
  const tone = (() => {
    switch (approval.state) {
      case "pending":  return "border-amber-300/50 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100"
      case "stale":    return "border-warning/40 bg-warning/10 text-warning"
      case "expired":  return "border-destructive/40 bg-destructive/10 text-destructive"
      case "decided":  return approval.decision === "approved"
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-warning/40 bg-warning/10 text-warning"
      case "no_link":  return "border-warning/40 bg-warning/5 text-warning"
    }
  })()

  const sentAgo = approval.sentAt
    ? timeUntil(approval.sentAt).label
    : null
  const decidedAgo = approval.decidedAt
    ? timeUntil(approval.decidedAt).label
    : null

  const headline = (() => {
    switch (approval.state) {
      case "pending":  return `Aguardando há ${sentAgo ?? "instantes"}`
      case "stale":    return `Parado há ${sentAgo ?? "+3 dias"} — provavelmente precisa cobrar`
      case "expired":  return `Link expirou — gere um novo (mover status no Notion)`
      case "decided":  return approval.decision === "approved"
                          ? `Aprovado ${decidedAgo ? `há ${decidedAgo.replace("atrás", "").trim()}` : ""}`.trim()
                          : approval.decision === "revision"
                            ? `Cliente pediu alterações ${decidedAgo ? `há ${decidedAgo.replace("atrás", "").trim()}` : ""}`.trim()
                            : `Rejeitado ${decidedAgo ? `há ${decidedAgo.replace("atrás", "").trim()}` : ""}`.trim()
      case "no_link":  return "Aguardando criação do link de aprovação (cron roda a cada 5 min)"
    }
  })()

  async function copyLink() {
    if (!approval.approvalUrl) return
    try {
      await navigator.clipboard.writeText(approval.approvalUrl)
      toast.success("Link copiado")
    } catch {
      toast.error("Não consegui copiar — selecione no campo acima")
    }
  }

  async function resendViaWa() {
    if (!approval.approvalUrl) {
      toast.error("Sem link de aprovação ainda — espera o próximo ciclo do cron")
      return
    }
    if (!approval.contactPhone) {
      toast.error("Contato sem telefone no Notion")
      return
    }
    setResending(true)
    // Open wa.me with a pre-filled message. We don't go through Meta Cloud
    // here because if it failed once, it'll fail again — manual deep-link
    // bypasses that and lets the agency owner send from their phone.
    //
    // Use the per-client custom template if set; fall back to a sensible
    // default. Placeholders are simple {{name}} substitutions — keep
    // parity with the documented set in /clients ApprovalPanel.
    const phoneDigits = approval.contactPhone.replace(/\D/g, "")
    const tpl = approval.manualWaTemplate?.trim() ||
      `Olá {{contact_name}}! Link pra você aprovar o post "{{post_title}}":\n{{approval_url}}`
    const msg = tpl
      .replace(/\{\{\s*contact_name\s*\}\}/g, approval.contactName || "")
      .replace(/\{\{\s*post_title\s*\}\}/g, post.title || "")
      .replace(/\{\{\s*approval_url\s*\}\}/g, approval.approvalUrl || "")
      .replace(/\{\{\s*client_name\s*\}\}/g, approval.ownerClientName || "")
    const waUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`
    window.open(waUrl, "_blank")
    setResending(false)
    onAction?.()
  }

  return (
    <div className={cn("mt-3 rounded-md border px-3 py-2 text-sm", tone)}>
      <div className="flex flex-wrap items-center gap-2">
        {approval.state === "decided" && approval.decision === "approved" ? (
          <ThumbsUp className="h-3.5 w-3.5 shrink-0" />
        ) : approval.state === "decided" && approval.decision === "rejected" ? (
          <ThumbsDown className="h-3.5 w-3.5 shrink-0" />
        ) : approval.state === "decided" && approval.decision === "revision" ? (
          <MessageSquareWarning className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <MessageCircle className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="font-medium">{headline}</span>
        {approval.contactName && approval.state !== "decided" && (
          <span className="text-[13px] opacity-80">· {approval.contactName}</span>
        )}
        {approval.contactPhone && approval.state !== "decided" && (
          <span
            className="text-[13px] font-mono opacity-70"
            title="Telefone resolvido do contato no Notion — é pra esse número que o WhatsApp vai."
          >
            · {approval.contactPhone}
          </span>
        )}
        {approval.sentVia === "meta_cloud" && approval.state !== "decided" && approval.state !== "expired" && (
          <Badge
            variant="success"
            size="sm"
            title={`Enviado via WhatsApp${approval.sentAt ? ` em ${new Date(approval.sentAt).toLocaleString("pt-BR")}` : ""}`}
          >
            ✓ Enviado
          </Badge>
        )}
        {approval.sentVia === "manual" && approval.state !== "decided" && approval.state !== "expired" && (
          <Badge variant="muted" size="sm">✋ Modo manual</Badge>
        )}
        {approval.sentVia === "none" && (approval.state === "pending" || approval.state === "stale") && (
          <Badge
            variant="warning"
            size="sm"
            title={approval.lastError ?? "WhatsApp não foi enviado automaticamente"}
          >
            ⚠ {approval.lastError ?? "Não enviado"}
          </Badge>
        )}
        {approval.sentVia === "invalid_phone" && (
          <Badge variant="destructive" size="sm">⚠ Telefone inválido</Badge>
        )}
        {approval.state === "decided" && approval.decision === "approved" && (
          <Badge variant="success" size="sm">✓ Aprovado</Badge>
        )}
        {approval.state === "decided" && approval.decision === "revision" && (
          <Badge variant="warning" size="sm">🔁 Pediu alterações</Badge>
        )}
        {approval.state === "expired" && (
          <Badge variant="muted" size="sm">⏱ Expirado</Badge>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {approval.state === "no_link" && (
            <button
              onClick={triggerNow}
              disabled={triggering}
              className="inline-flex items-center gap-1 rounded border border-current/30 bg-background/70 px-1.5 py-0.5 text-[13px] font-medium hover:bg-background disabled:opacity-50"
              title="Forçar criação do link agora (sem esperar o cron)"
            >
              {triggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              Disparar agora
            </button>
          )}
          {approval.approvalUrl && approval.state !== "decided" && approval.state !== "expired" && (
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1 rounded border border-current/20 bg-background/50 px-1.5 py-0.5 text-[13px] font-medium hover:bg-background"
              title="Copiar link de aprovação"
            >
              <Copy className="h-3 w-3" />
              Copiar
            </button>
          )}
          {approval.contactPhone && approval.state !== "decided" && approval.state !== "expired" && (
            <button
              onClick={dispatchThisPost}
              disabled={dispatching}
              className="inline-flex items-center gap-1 rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-[13px] font-medium text-success hover:bg-success/15 disabled:opacity-50"
              title={`Disparar SÓ este post via WhatsApp para ${approval.contactPhone}`}
            >
              {dispatching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              Disparar este
            </button>
          )}
          {approval.contactPhone && approval.state !== "decided" && approval.state !== "expired" && approval.approvalUrl && (
            <button
              onClick={resendViaWa}
              disabled={resending}
              className="inline-flex items-center gap-1 rounded border border-current/30 bg-background/70 px-1.5 py-0.5 text-[13px] font-medium hover:bg-background"
              title="Abrir WhatsApp com mensagem pré-preenchida"
            >
              <MessageCircle className="h-3 w-3" />
              {approval.sentVia === "none" ? "Enviar WA" : "Reenviar WA"}
            </button>
          )}
        </div>
      </div>
      {approval.comment && approval.state === "decided" && (
        <p className="mt-1.5 break-words border-t border-current/15 pt-1.5 text-[13px] opacity-90">
          &quot;{approval.comment}&quot;
        </p>
      )}
    </div>
  )
}

// ─── Preview dialog ────────────────────────────────
// Renders a per-platform mockup of how the post will appear when published.
// Mockups are simplified — just enough to catch obvious issues like missing
// media, wrong aspect ratio, or caption that's way too long.

function PreviewDialog({ post, onClose }: { post: ScheduledPost; onClose: () => void }) {
  const targets = post.targetChecks ?? []
  const caption = post.fullCaption ?? post.caption ?? ""

  // Pick the best media URL + kind per target. The previous version returned
  // a video URL for reel/story/youtube targets and rendered it inside <img>,
  // which broke (browsers can't display a video inside <img>). Now we prefer
  // post.thumbnailUrl for video targets, and fall back to a real <video>
  // element only if no thumbnail exists.
  function mediaForTarget(t: TargetCheck): { kind: "image" | "video"; url: string } | null {
    const tipo = t.tipo.toLowerCase()
    const isVideoTarget = tipo === "reel" || tipo === "story" || tipo === "youtube short" || tipo === "youtube"

    if (isVideoTarget) {
      // Notion's "Thumbnail" field is built for this. If filled, render it
      // as an image with a play overlay.
      if (post.thumbnailUrl) return { kind: "image", url: post.thumbnailUrl }
      // No thumbnail → render the video itself (poster missing, but better
      // than a broken image icon). Vertical for reel/story/short, horizontal
      // for regular YouTube.
      const videoUrl = tipo === "youtube" ? post.horizontalUrls?.[0] : post.verticalUrls?.[0]
      if (videoUrl) return { kind: "video", url: videoUrl }
      return null
    }

    // Static-media targets — feed/carrossel (or unknown). Always image.
    const url = post.feedImageUrls?.[0] ?? post.thumbnailUrl ?? post.verticalUrls?.[0] ?? null
    return url ? { kind: "image", url } : null
  }

  function aspectClass(t: TargetCheck): string {
    const tipo = t.tipo.toLowerCase()
    if (tipo === "feed") return "aspect-square"
    if (tipo === "reel" || tipo === "story" || tipo === "youtube short") return "aspect-[9/16]"
    if (tipo === "youtube") return "aspect-video"
    if (tipo === "carrossel") return "aspect-square"
    return "aspect-square"
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-xl border bg-background p-4 sm:rounded-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-wider text-muted-foreground">Preview</p>
            <h3 className="text-xl truncate">{post.title || "Sem título"}</h3>
            <p className="text-sm text-muted-foreground">@{post.conta}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {targets.length === 0 ? (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-base text-warning">
            Campo &quot;Publicar em&quot; vazio — sem plataformas pra prever.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {targets.map((t) => {
              const media = mediaForTarget(t)
              const isVideoTarget = ["reel", "story", "youtube short", "youtube"].includes(t.tipo.toLowerCase())
              return (
                <div key={t.raw} className="rounded-lg border bg-card overflow-hidden">
                  <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", platformClass(t.platform))}>
                      {t.raw}
                    </span>
                    {!t.configured && (
                      <span className="text-warning ml-auto inline-flex items-center gap-1 text-[12px] uppercase tracking-wider">
                        <AlertTriangle className="h-3 w-3" /> Sem conta
                      </span>
                    )}
                  </div>
                  <div className={cn("relative bg-muted", aspectClass(t))}>
                    {media?.kind === "image" && (
                      <img src={media.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                    {media?.kind === "video" && (
                      <video
                        src={media.url}
                        className="absolute inset-0 h-full w-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    )}
                    {media && isVideoTarget && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="rounded-full bg-black/50 p-3">
                          <Play className="h-6 w-6 text-white" fill="white" />
                        </div>
                      </div>
                    )}
                    {!media && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                        <AlertTriangle className="h-6 w-6 mb-1" />
                        <span className="text-sm">
                          {isVideoTarget ? "Sem thumbnail nem vídeo" : "Sem mídia"}
                        </span>
                      </div>
                    )}
                  </div>
                  {caption && (
                    <div className="p-3">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6">
                        <strong className="text-foreground">{post.conta}</strong>{" "}
                        {caption}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <strong>Heads up:</strong> isso é um mock visual baseado nos campos do Notion. As plataformas podem aplicar crops/compressão diferentes na hora real da publicação.
        </div>
      </div>
    </div>
  )
}

// ─── Calendar view ────────────────────────────────────

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
  // Drag-and-drop reschedule state. We track the dragged post's pageId
  // + connectionId locally so the drop handler can PATCH Notion.
  const [draggingPost, setDraggingPost] = useState<{ pageId: string; connectionId: string; fromDay: string } | null>(null)
  const [rescheduling, setRescheduling] = useState(false)

  // dnd-kit sensors. Pointer covers desktop (mouse/trackpad) — distance: 5
  // gates the drag so a regular click doesn't accidentally start one.
  // Touch sensor mirrors that on mobile with a delay so a tap-to-open-day
  // remains responsive (delay: 200ms; tolerance: 5px lets the finger jitter).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

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

  async function reschedulePost(
    pageId: string,
    connectionId: string,
    fromDay: string,
    targetDayKey: string,
  ) {
    if (fromDay === targetDayKey) return
    setRescheduling(true)
    try {
      // targetDayKey is YYYY-MM-DD. The backend handles preserving time.
      const newDateIso = `${targetDayKey}T09:00:00`
      const res = await fetch("/api/notion/post-reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, connectionId, newDateIso }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? "Erro ao remarcar")
      toast.success("Post remarcado")
      onPublished()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remarcar")
    } finally {
      setRescheduling(false)
    }
  }

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current as
      | { pageId: string; connectionId: string; fromDay: string }
      | undefined
    if (!data) return
    setDraggingPost(data)
  }

  function handleDragEnd(e: DragEndEvent) {
    const dragged = e.active.data.current as
      | { pageId: string; connectionId: string; fromDay: string }
      | undefined
    const targetDay = e.over?.id as string | undefined
    setDraggingPost(null)
    if (!dragged || !targetDay) return
    void reschedulePost(dragged.pageId, dragged.connectionId, dragged.fromDay, targetDay)
  }

  const selectedDayPosts = selectedDay ? postsByDay.get(selectedDay) ?? [] : []

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-xl capitalize">{monthLabel}</h2>
          <p className="text-[13px] text-muted-foreground">
            💡 Arraste posts agendados pra outro dia pra remarcar (no mobile, segura por 1s antes de arrastar) — atualiza a data no Notion automaticamente.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {rescheduling && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Button variant="ghost" size="sm" onClick={goToday}>Hoje</Button>
          <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {WEEKDAYS_PT.map((w) => (
              <div key={w} className="px-2 py-2 text-center">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((day) => {
              const key = ymd(day)
              const dayPosts = postsByDay.get(key) ?? []
              return (
                <CalendarDayCell
                  key={key}
                  dayKey={key}
                  day={day}
                  inMonth={day.getMonth() === cursor.getMonth()}
                  isToday={key === todayKey}
                  posts={dayPosts}
                  willPublish={willPublish}
                  draggingFromDay={draggingPost?.fromDay ?? null}
                  rescheduling={rescheduling}
                  onClickDay={() => {
                    if (rescheduling) return
                    if (dayPosts.length > 0) setSelectedDay(key)
                  }}
                />
              )
            })}
          </div>
        </div>
      </DndContext>

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

// Single day cell — droppable surface registered via useDroppable. The
// hover ring + bg tint is now driven by `isOver` from dnd-kit instead of
// our own hover state, which means it works the same on touch and mouse.
function CalendarDayCell({
  dayKey,
  day,
  inMonth,
  isToday,
  posts,
  willPublish,
  draggingFromDay,
  rescheduling,
  onClickDay,
}: {
  dayKey: string
  day: Date
  inMonth: boolean
  isToday: boolean
  posts: AnyPost[]
  willPublish: (p: ScheduledPost) => boolean
  draggingFromDay: string | null
  rescheduling: boolean
  onClickDay: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey })
  const visible = posts.slice(0, 3)
  const overflow = posts.length - visible.length
  const isDragSource = draggingFromDay === dayKey

  return (
    <div
      ref={setNodeRef}
      onClick={onClickDay}
      className={cn(
        "min-h-[96px] border-b border-r p-1.5 text-left align-top transition-colors",
        "[&:nth-child(7n)]:border-r-0",
        inMonth ? "bg-card" : "bg-muted/20 text-muted-foreground/60",
        posts.length > 0 ? "hover:bg-muted/40 cursor-pointer" : "cursor-default",
        isOver && !isDragSource && "ring-2 ring-inset ring-primary bg-primary/5",
        isDragSource && "opacity-40",
      )}
    >
      <div className={cn(
        "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-sm font-medium",
        isToday && "bg-primary text-primary-foreground",
        !isToday && !inMonth && "text-muted-foreground/50",
      )}>
        {day.getDate()}
      </div>
      <div className="space-y-0.5">
        {visible.map((p) => (
          <DraggablePostChip
            key={p.kind + ":" + p.pageId}
            post={p}
            fromDay={dayKey}
            disabled={rescheduling}
            ok={p.kind === "upcoming" ? willPublish(p as ScheduledPost) : true}
          />
        ))}
        {overflow > 0 && (
          <div className="px-1 text-[12px] font-medium text-muted-foreground">
            +{overflow} mais
          </div>
        )}
      </div>
    </div>
  )
}

// Each chip is its own draggable. Past posts and upcoming posts without
// a connectionId are rendered without a drag handle since they can't be
// rescheduled (past = immutable; upcoming-without-conn = orphaned).
function DraggablePostChip({
  post,
  fromDay,
  disabled,
  ok,
}: {
  post: AnyPost
  fromDay: string
  disabled: boolean
  ok: boolean
}) {
  const isUpcoming = post.kind === "upcoming"
  const sp = isUpcoming ? (post as ScheduledPost) : null
  const draggable = isUpcoming && !!sp?.connectionId && !disabled

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${post.kind}:${post.pageId}`,
    data: draggable
      ? { pageId: sp!.pageId, connectionId: sp!.connectionId, fromDay }
      : undefined,
    disabled: !draggable,
  })

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        draggable && "cursor-grab touch-none",
        isDragging && "opacity-50",
      )}
    >
      <CalendarChip post={post} ok={ok} />
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
          "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[13px] leading-tight",
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
        <span className="shrink-0 font-mono text-[12px] opacity-70">{time}</span>
        <span className="truncate">{post.title || "Sem título"}</span>
      </div>
    )
  }

  const platform = post.targetChecks?.[0]?.platform ?? "instagram"
  const failedHistory = (post.priorAttempts ?? []).some((pl) => pl.status === "failed")
  return (
    <div
      className={cn(
        "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[13px] leading-tight",
        failedHistory ? "bg-warning/15 text-warning" : ok ? platformClass(platform) : "bg-warning/15 text-warning"
      )}
      title={failedHistory ? `${post.title} (com tentativas anteriores)` : post.title}
    >
      {failedHistory && <RefreshCw className="h-2.5 w-2.5 shrink-0" />}
      <span className="shrink-0 font-mono text-[12px] opacity-70">{time}</span>
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
            <p className="text-sm uppercase tracking-wider text-muted-foreground">Agenda do dia</p>
            <h3 className="text-xl capitalize">{label}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {posts.map((post) => {
            if (post.kind === "past") {
              return <PastPostRow key={"past:" + post.pageId + post.date} post={post} onRetried={onPublished} />
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
