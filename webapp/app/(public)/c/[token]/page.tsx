"use client"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, AlertTriangle, Loader2, Clock, Building2, MessageCircle, ChevronLeft, ChevronRight, ExternalLink, Play, X, Download, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { PostMockup } from "@/components/post/post-mockup"

// Public client-facing calendar. Client opens this from a permanent
// WhatsApp link the agency shared once. Token is on the URL. Three
// tabs: Pendentes (with inline approve), Agendados, Publicados.
// Calendar at top shows all of them with color coding.

type TargetCheck = {
  raw: string
  platform: string
  tipo: string
}

type SlimPost = {
  pageId: string
  title: string
  conta: string
  scheduledDate: string | null
  publishTargets: TargetCheck[]
  thumbnailUrl: string | null
  feedImageUrls: string[]
  verticalUrls: string[]
  horizontalUrls: string[]
  previewVerticalUrl?: string | null
  previewHorizontalUrl?: string | null
  allMediaUrls?: string[]
  fullCaption: string
}

type PendingPost = SlimPost & {
  connectionId: string
  approvalToken: string | null
}

type ScheduledPost = SlimPost & {
  connectionId: string
}

type PastPost = {
  pageId: string
  title: string
  conta: string
  date: string
  platforms: Array<{ raw: string; status: string; postUrl: string | null }>
}

type ProductionItem = {
  id: string
  title: string
  type: string
  status: string
  statusLabel: string
  topic: string | null
  specialistName: string | null
  recordingDate: string | null
  deliveryDate: string | null
  publishDate: string | null
  finalVideoUrl: string | null
  hasVerticalMedia?: boolean
  hasHorizontalMedia?: boolean
  notionStatus?: string | null
  notionStatusSyncedAt?: string | null
  createdAt?: string
  updatedAt: string
  pendingApprovalToken: string | null
}

type CalendarData = {
  client: {
    name: string
    logoUrl: string | null
    briefingFormUrl?: string | null
    hasBriefing?: boolean
  }
  pending: PendingPost[]
  scheduled: ScheduledPost[]
  past: PastPost[]
  productions?: ProductionItem[]
}

// Infere targets plausíveis pelo título do post (+ shape da mídia)
// quando "Publicar em" não tem valores reconhecíveis. Sem isso, o dialog
// mostra só aviso sem mídia. Retorna ARRAY — título pode mencionar várias
// plataformas ("Reels + Shorts + TikTok") e cada uma vira um mockup.
function inferFallbackTargets(post: SlimPost): TargetCheck[] {
  const title = (post.title ?? "").toLowerCase()
  const hasVertical = (post.verticalUrls?.length ?? 0) > 0
  const hasFeed = (post.feedImageUrls?.length ?? 0) > 0
  const hasHorizontal = (post.horizontalUrls?.length ?? 0) > 0
  const hasPreviewVertical = !!post.previewVerticalUrl
  const hasPreviewHorizontal = !!post.previewHorizontalUrl
  const hasMultipleImages =
    (post.feedImageUrls?.length ?? 0) > 1
    || (post.allMediaUrls?.length ?? 0) > 1
    || (post.verticalUrls?.length ?? 0) > 1

  const targets: TargetCheck[] = []
  const push = (raw: string, platform: string, tipo: string) => {
    if (!targets.find((t) => t.raw === raw)) targets.push({ raw, platform, tipo })
  }

  // Cada keyword no título adiciona um target. Pode ter vários.
  if (/instagram\s*carross?el/.test(title) || /\bcarross?el\b/.test(title)) push("Instagram Carrossel", "instagram", "carrossel")
  if (/instagram\s*reels?/.test(title) || /\breels?\b/.test(title)) push("Instagram Reels", "instagram", "reel")
  if (/instagram\s*stor(y|ies)/.test(title) || /\bstor(y|ies)\b/.test(title)) push("Instagram Story", "instagram", "story")
  if (/instagram\s*feed/.test(title) || (/\binstagram\b/.test(title) && !/carross|reels?|stor/.test(title))) push("Instagram Feed", "instagram", "feed")
  if (/youtube\s*shorts?/.test(title) || /\bshorts?\b/.test(title)) push("YouTube Shorts", "youtube", "youtube short")
  if (/youtube\s*long/.test(title) || (/\byoutube\b/.test(title) && !/shorts?/.test(title))) push("YouTube", "youtube", "youtube")
  if (/\btiktok\b/.test(title)) push("TikTok", "tiktok", "feed")
  if (/\blinkedin\b/.test(title)) push("LinkedIn", "linkedin", "feed")
  if (/\bfacebook\b/.test(title)) push("Facebook", "facebook", "feed")

  if (targets.length > 0) return targets

  // Sem keywords no título — infere 1 target pelo shape da mídia disponível.
  // Quando há preview tanto vertical quanto horizontal, é forte sinal de
  // "vai pra YouTube + Reel/Short/TikTok" — gera os 2.
  if (hasPreviewVertical && hasPreviewHorizontal) {
    push("YouTube", "youtube", "youtube")
    push("Instagram Reels", "instagram", "reel")
    return targets
  }

  let tipo: string
  let platform: string
  let raw: string
  if (hasMultipleImages) {
    tipo = "carrossel"; platform = "instagram"; raw = "Instagram Carrossel"
  } else if (hasHorizontal || (hasPreviewHorizontal && !hasPreviewVertical)) {
    tipo = "youtube"; platform = "youtube"; raw = "YouTube"
  } else if (hasVertical || hasPreviewVertical) {
    tipo = "reel"; platform = "instagram"; raw = "Instagram Reels"
  } else if (hasFeed) {
    tipo = "feed"; platform = "instagram"; raw = "Instagram Feed"
  } else {
    tipo = "feed"; platform = "instagram"; raw = "Instagram Feed"
  }
  push(raw, platform, tipo)
  return targets
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-700",
  facebook: "bg-blue-100 text-blue-700",
  youtube: "bg-red-100 text-red-700",
  tiktok: "bg-purple-100 text-purple-700",
  linkedin: "bg-sky-100 text-sky-700",
}

function platformClass(platform: string) {
  return PLATFORM_COLORS[platform.toLowerCase()] ?? "bg-muted text-muted-foreground"
}

const WEEKDAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

type Tab = "pendentes" | "agendados" | "publicados" | "producoes" | "briefing" | "performance"

type MetricsData = {
  windowDays: number
  summary: {
    posts: number
    likes: number
    comments: number
    reach: number
    saves: number
    impressions: number
    lastSyncedAt: string | null
  }
  topPosts: Array<{
    pageId: string
    title: string
    platform: string | null
    postUrl: string | null
    publishedAt: string
    likes: number
    comments: number
    reach: number
    saves: number
  }>
  recent: Array<{
    pageId: string
    title: string
    platform: string | null
    publishedAt: string
    likes: number
    comments: number
    reach: number
  }>
}

type BriefingField = {
  name: string
  type: string
  value: string | string[] | number | null
}
type BriefingData = {
  configured: boolean
  pageUrl?: string | null
  lastEditedTime?: string | null
  error?: string
  fields?: BriefingField[]
}

export default function ClientCalendarPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("pendentes")
  const [selectedPending, setSelectedPending] = useState<PendingPost | null>(null)
  // Preview-only (sem botão de decidir). Usado pra Agendados (post já
  // vem com mídia) e Publicados (busca live no Notion). Quando pageId
  // é setado mas a mídia ainda não veio, mostramos loading.
  const [previewPost, setPreviewPost] = useState<SlimPost | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  async function openPreviewByPageId(pageId: string, fallback: { title: string; conta: string }) {
    setPreviewLoading(true)
    setPreviewPost({
      pageId,
      title: fallback.title,
      conta: fallback.conta,
      scheduledDate: null,
      publishTargets: [],
      thumbnailUrl: null,
      feedImageUrls: [],
      verticalUrls: [],
      horizontalUrls: [],
      previewVerticalUrl: null,
      previewHorizontalUrl: null,
      allMediaUrls: [],
      fullCaption: "",
    })
    try {
      const res = await fetch(`/api/c/${token}/post/${pageId}`)
      if (!res.ok) {
        toast.error("Não foi possível carregar o post.")
        setPreviewPost(null)
        return
      }
      const json = await res.json()
      setPreviewPost(json)
    } catch {
      toast.error("Erro ao carregar.")
      setPreviewPost(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function load() {
    try {
      const res = await fetch(`/api/c/${token}`)
      if (res.status === 404) {
        setError("Link inválido — peça pra agência reenviar.")
        return
      }
      if (!res.ok) {
        setError("Erro ao carregar — tente recarregar a página.")
        return
      }
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!token) return
    load()
  }, [token])

  // Auto-pick best initial tab: pending if any, else agendados, else publicados.
  useEffect(() => {
    if (!data) return
    if (data.pending.length > 0) setTab("pendentes")
    else if (data.scheduled.length > 0) setTab("agendados")
    else if (data.past.length > 0) setTab("publicados")
  }, [data])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" />
            <p className="text-lg font-medium">{error ?? "Erro desconhecido"}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-background pb-20">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[32rem] overflow-hidden">
        <div className="absolute left-1/2 top-[-10rem] h-[40rem] w-[40rem] -translate-x-1/2 rounded-full aurora-bg" />
      </div>
      {/* Header */}
      <div className="border-b bg-card/70 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 lg:px-8">
          {data.client.logoUrl ? (
            <img src={data.client.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[12px] uppercase tracking-wider text-muted-foreground">Agenda de conteúdo</p>
            <p className="truncate text-base">{data.client.name}</p>
          </div>
          {data.pending.length > 0 && (
            <Badge variant="warning" size="sm" className="py-1">
              {data.pending.length} aguardando você
            </Badge>
          )}
          {/* Botão sempre visível quando agência configurou briefingFormUrl.
              Abre form externo (Notion form) que preenche a DB de Produções.
              Versão MVP — depois pode virar wizard interno. */}
          {data.client.briefingFormUrl && (
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <a href={data.client.briefingFormUrl} target="_blank" rel="noopener noreferrer">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Solicitar produção</span>
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4 lg:px-8 lg:py-6">
        {/* Stats bento — só em desktop. No mobile o calendar e tabs já
            cobrem a info. */}
        <div className="mb-4 hidden gap-3 lg:grid lg:grid-cols-4">
          <StatCard
            label="Aguardando você"
            value={data.pending.length}
            tone="warning"
            hint={data.pending.length === 1 ? "1 post pra aprovar" : `${data.pending.length} posts pra aprovar`}
          />
          <StatCard
            label="Agendados"
            value={data.scheduled.length}
            tone="default"
            hint={nextScheduledHint(data.scheduled)}
          />
          <StatCard
            label="Publicados (90d)"
            value={data.past.length}
            tone="muted"
          />
          <StatCard
            label="Em produção"
            value={data.productions?.filter((p) => p.status !== "published").length ?? 0}
            tone="muted"
            hint={data.productions?.length ? "Veja na aba Produções" : null}
          />
        </div>

        {/* Bento layout: calendário fica à esquerda (sticky em lg+), tabs
            + lista à direita. Mobile vira 1 coluna na ordem natural. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <CalendarMonth
              pending={data.pending}
              scheduled={data.scheduled}
              past={data.past}
              onOpenPending={setSelectedPending}
              onOpenScheduled={(p) => setPreviewPost(p)}
              onOpenPast={(p) => openPreviewByPageId(p.pageId, { title: p.title, conta: p.conta })}
            />
          </div>

          <div>
            {/* Tabs */}
            <div className="mb-4 inline-flex rounded-lg border bg-card p-0.5 w-full sm:w-auto flex-wrap">
              {([
                { v: "pendentes" as const, label: "Pendentes", count: data.pending.length, show: true },
                { v: "agendados" as const, label: "Agendados", count: data.scheduled.length, show: true },
                { v: "publicados" as const, label: "Publicados", count: data.past.length, show: true },
                { v: "producoes" as const, label: "Produções", count: data.productions?.length ?? 0, show: true },
                { v: "briefing" as const, label: "Briefing", count: 0, show: !!data.client.hasBriefing, hideCount: true },
                { v: "performance" as const, label: "Performance", count: 0, show: data.past.length > 0, hideCount: true },
              ] as const).filter((o) => o.show).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setTab(opt.v)}
                  className={cn(
                    "flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    tab === opt.v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                  {!("hideCount" in opt && opt.hideCount) && (
                    <span className={cn(
                      "rounded-full px-1.5 text-[12px]",
                      tab === opt.v ? "bg-background" : "bg-muted"
                    )}>
                      {opt.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === "pendentes" && <PendingList pending={data.pending} onOpen={setSelectedPending} />}
            {tab === "agendados" && <ScheduledList scheduled={data.scheduled} onOpen={(p) => setPreviewPost(p)} />}
            {tab === "briefing" && <BriefingPanel />}
            {tab === "performance" && <PerformancePanel />}
            {tab === "publicados" && (
              <PublishedList
                past={data.past}
                onOpen={(p) => openPreviewByPageId(p.pageId, { title: p.title, conta: p.conta })}
              />
            )}
            {tab === "producoes" && <ProductionsList productions={data.productions ?? []} />}
          </div>
        </div>
      </div>

      {/* Approval dialog */}
      {selectedPending && (
        <ApprovalDialog
          post={selectedPending}
          onClose={() => setSelectedPending(null)}
          onDecided={() => { setSelectedPending(null); load() }}
        />
      )}

      {/* Preview dialog (read-only) */}
      {previewPost && (
        <PreviewDialog
          post={previewPost}
          loading={previewLoading}
          onClose={() => setPreviewPost(null)}
        />
      )}
    </div>
  )
}

// Helper: stat card no bento do topo (desktop only).
function StatCard({
  label, value, tone, hint,
}: {
  label: string
  value: number
  tone: "default" | "warning" | "muted"
  hint?: string | null
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-card px-4 py-3",
      tone === "warning" && "border-warning/40 bg-warning/5",
    )}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-0.5 text-2xl font-semibold tabular-nums",
        tone === "warning" && "text-warning",
      )}>
        {value}
      </p>
      {hint && <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </div>
  )
}

function nextScheduledHint(scheduled: ScheduledPost[]): string | null {
  const upcoming = scheduled
    .filter((s) => s.scheduledDate)
    .map((s) => new Date(s.scheduledDate!).getTime())
    .filter((t) => t > Date.now())
    .sort((a, b) => a - b)[0]
  if (!upcoming) return null
  const diffMs = upcoming - Date.now()
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (days === 0) {
    const hours = Math.max(1, Math.floor(diffMs / (60 * 60 * 1000)))
    return `próximo em ${hours}h`
  }
  if (days === 1) return "próximo amanhã"
  return `próximo em ${days} dias`
}

// ─── Calendar ────────────────────────────────

function CalendarMonth({
  pending, scheduled, past,
  onOpenPending, onOpenScheduled, onOpenPast,
}: {
  pending: PendingPost[]
  scheduled: ScheduledPost[]
  past: PastPost[]
  onOpenPending: (p: PendingPost) => void
  onOpenScheduled: (p: ScheduledPost) => void
  onOpenPast: (p: PastPost) => void
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  type DayItem =
    | { kind: "pending"; title: string; time: string; platform: string; ref: PendingPost }
    | { kind: "scheduled"; title: string; time: string; platform: string; ref: ScheduledPost }
    | { kind: "past"; title: string; time: string; platform: string; ref: PastPost }
  const byDay = useMemo(() => {
    const map = new Map<string, DayItem[]>()
    function add(date: string | null, item: DayItem) {
      if (!date) return
      const key = ymd(new Date(date))
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    for (const p of pending) {
      add(p.scheduledDate, {
        kind: "pending",
        title: p.title || "Sem título",
        time: p.scheduledDate ? new Date(p.scheduledDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "",
        platform: p.publishTargets[0]?.platform ?? "instagram",
        ref: p,
      })
    }
    for (const p of scheduled) {
      add(p.scheduledDate, {
        kind: "scheduled",
        title: p.title || "Sem título",
        time: p.scheduledDate ? new Date(p.scheduledDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "",
        platform: p.publishTargets[0]?.platform ?? "instagram",
        ref: p,
      })
    }
    for (const p of past) {
      add(p.date, {
        kind: "past",
        title: p.title || "Sem título",
        time: new Date(p.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        platform: p.platforms[0]?.raw.toLowerCase().split(/[\s-]+/)[0] ?? "instagram",
        ref: p,
      })
    }
    return map
  }, [pending, scheduled, past])

  function handleItemClick(item: DayItem) {
    if (item.kind === "pending") onOpenPending(item.ref)
    else if (item.kind === "scheduled") onOpenScheduled(item.ref)
    else onOpenPast(item.ref)
  }

  const grid = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg capitalize">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => {
            const d = new Date()
            setCursor(new Date(d.getFullYear(), d.getMonth(), 1))
          }}>Hoje</Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          {WEEKDAYS_PT.map((w) => (
            <div key={w} className="px-1 py-1.5 text-center">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((day) => {
            const key = ymd(day)
            const inMonth = day.getMonth() === cursor.getMonth()
            const isToday = key === todayKey
            const items = byDay.get(key) ?? []
            const visible = items.slice(0, 2)
            const overflow = items.length - visible.length
            return (
              <div
                key={key}
                className={cn(
                  "min-h-[72px] border-b border-r p-1 text-left align-top",
                  "[&:nth-child(7n)]:border-r-0",
                  inMonth ? "bg-card" : "bg-muted/20 text-muted-foreground/60",
                )}
              >
                <div className={cn(
                  "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[13px] font-medium",
                  isToday && "bg-primary text-primary-foreground",
                )}>
                  {day.getDate()}
                </div>
                <div className="space-y-0.5">
                  {visible.map((it, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleItemClick(it)}
                      className={cn(
                        "block w-full truncate rounded px-1 py-0.5 text-[12px] leading-tight text-left transition-opacity active:opacity-70 hover:opacity-80",
                        it.kind === "pending" ? "bg-warning/15 text-warning" :
                          it.kind === "past" ? cn(platformClass(it.platform), "opacity-70") :
                          platformClass(it.platform)
                      )}
                      title={`${it.title} — toque pra abrir`}
                    >
                      <span className="font-mono text-[9px] opacity-70 mr-0.5">{it.time}</span>
                      {it.title}
                    </button>
                  ))}
                  {overflow > 0 && (
                    <div className="px-1 text-[9px] font-medium text-muted-foreground">+{overflow}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" />Aguardando você</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pink-400" />Agendado</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pink-400 opacity-50" />Publicado</span>
      </div>
    </div>
  )
}

// ─── Lists ────────────────────────────────

function PendingList({ pending, onOpen }: { pending: PendingPost[]; onOpen: (p: PendingPost) => void }) {
  if (pending.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success/60" />
          <p className="font-medium">Tudo aprovado!</p>
          <p className="mt-1 text-base text-muted-foreground">Não há posts aguardando sua aprovação no momento.</p>
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="space-y-2">
      {pending.map((p) => (
        <button
          key={p.pageId}
          onClick={() => onOpen(p)}
          className="w-full rounded-lg border border-warning/40 bg-warning/5 p-3 text-left transition-colors hover:bg-warning/10"
        >
          <div className="flex items-start gap-3">
            <PostThumb post={p} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                {p.publishTargets.slice(0, 3).map((t) => (
                  <Badge key={t.raw} className={cn("text-[9px]", platformClass(t.platform))}>{t.raw}</Badge>
                ))}
                {p.publishTargets.length > 3 && <span className="text-[12px] text-muted-foreground">+{p.publishTargets.length - 3}</span>}
              </div>
              <p className="font-medium truncate">{p.title || "Sem título"}</p>
              <p className="text-sm text-muted-foreground truncate">@{p.conta}</p>
              {p.scheduledDate && (
                <p className="mt-1 text-sm text-muted-foreground">
                  <Clock className="inline h-3 w-3 mr-0.5" />
                  {new Date(p.scheduledDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-warning text-warning-foreground px-2 py-1 text-[12px] font-medium">
              Aprovar →
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}

function ScheduledList({ scheduled, onOpen }: { scheduled: ScheduledPost[]; onOpen: (p: ScheduledPost) => void }) {
  if (scheduled.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Clock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">Nenhum post agendado</p>
        </CardContent>
      </Card>
    )
  }
  const sorted = [...scheduled].sort((a, b) => {
    if (!a.scheduledDate) return 1
    if (!b.scheduledDate) return -1
    return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
  })
  return (
    <div className="space-y-2">
      {sorted.map((p) => (
        <button
          key={p.pageId}
          onClick={() => onOpen(p)}
          className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40"
        >
          <div className="flex items-start gap-3">
            <PostThumb post={p} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                {p.publishTargets.slice(0, 3).map((t) => (
                  <Badge key={t.raw} className={cn("text-[9px]", platformClass(t.platform))}>{t.raw}</Badge>
                ))}
              </div>
              <p className="font-medium truncate">{p.title || "Sem título"}</p>
              <p className="text-sm text-muted-foreground truncate">@{p.conta}</p>
              {p.scheduledDate && (
                <p className="mt-1 text-sm text-muted-foreground">
                  <Clock className="inline h-3 w-3 mr-0.5" />
                  {new Date(p.scheduledDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

function PublishedList({ past, onOpen }: { past: PastPost[]; onOpen: (p: PastPost) => void }) {
  if (past.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">Nenhum post publicado nos últimos 90 dias</p>
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="space-y-2">
      {past.map((p) => (
        <div key={p.pageId + p.date} className="rounded-lg border bg-card overflow-hidden">
          <button
            onClick={() => onOpen(p)}
            className="w-full p-3 text-left transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                {p.platforms.map((pl) => {
                  const platform = pl.raw.toLowerCase().split(/[\s-]+/)[0]
                  return (
                    <Badge key={pl.raw} className={cn("text-[9px]", platformClass(platform))}>{pl.raw}</Badge>
                  )
                })}
              </div>
              <p className="font-medium truncate">{p.title || "Sem título"}</p>
              <p className="text-sm text-muted-foreground truncate">@{p.conta}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <Clock className="inline h-3 w-3 mr-0.5" />
                {new Date(p.date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </button>
          {p.platforms.some((pl) => pl.postUrl) && (
            <div className="flex flex-wrap gap-1.5 border-t bg-muted/20 px-3 py-2">
              {p.platforms.filter((pl) => pl.postUrl).map((pl) => {
                const platform = pl.raw.toLowerCase().split(/[\s-]+/)[0]
                return (
                  <a
                    key={pl.raw}
                    href={pl.postUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium hover:underline", platformClass(platform))}
                  >
                    Ver no {pl.raw}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Thumbs ────────────────────────────────

function youTubeIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, "")
    if (host === "youtu.be") return u.pathname.replace(/^\//, "").split("/")[0] || null
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v")
      const m = u.pathname.match(/^\/(shorts|embed)\/([^/?]+)/)
      if (m) return m[2]
    }
    return null
  } catch {
    return null
  }
}

function PostThumb({ post }: { post: SlimPost }) {
  const tipo = post.publishTargets[0]?.tipo.toLowerCase() ?? "feed"
  const isVideo = ["reel", "story", "youtube short", "youtube"].includes(tipo)

  // Prefer imagens estáticas (thumbnail dedicada > feed). Pra video targets
  // sem thumbnail, cai pro próprio arquivo de vídeo renderizado como
  // <video preload="metadata"> que mostra o primeiro frame. allMediaUrls
  // é o catch-all defensivo quando o field mapping não bate com os
  // nomes reais dos campos do workspace.
  // Stories estáticos / Reels com imagem promocional ficam no campo
  // "Mídia Vertical" como JPG/PNG — não como vídeo. Detecta por extensão
  // pra renderizar <img> em vez de <video src=imagem.jpg> que dá player
  // preto.
  const looksLikeVideo = (url: string) => /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url)
  const orientationCandidate = isVideo
    ? (tipo === "youtube" ? post.horizontalUrls?.[0] : post.verticalUrls?.[0]) ?? null
    : null
  const orientationIsVideo = orientationCandidate ? looksLikeVideo(orientationCandidate) : false

  const imgUrl = post.thumbnailUrl
    ?? post.feedImageUrls?.[0]
    ?? (orientationCandidate && !orientationIsVideo ? orientationCandidate : null)
    ?? (!isVideo ? (post.verticalUrls?.[0] ?? post.horizontalUrls?.[0]) : null)
    ?? null

  const videoUrl = !imgUrl && isVideo && orientationIsVideo
    ? orientationCandidate
    : null

  // Fallback final: qualquer mídia disponível em campos não-mapeados.
  const anyMedia = !imgUrl && !videoUrl ? post.allMediaUrls?.[0] ?? null : null
  const anyIsVideo = anyMedia ? looksLikeVideo(anyMedia) : false

  // Preview externo (YouTube unlisted etc.) — quando reconhecemos YouTube,
  // usamos a thumb pública (img.youtube.com/vi/{id}/hqdefault.jpg) como
  // imagem do thumb 56x56. Funciona pra qualquer vídeo, listed ou
  // unlisted, sem CORS.
  const previewUrl = !imgUrl && !videoUrl && !anyMedia
    ? (tipo === "youtube" ? post.previewHorizontalUrl : post.previewVerticalUrl)
      ?? post.previewVerticalUrl ?? post.previewHorizontalUrl ?? null
    : null
  const youTubeId = youTubeIdFromUrl(previewUrl)
  const youTubeThumb = youTubeId ? `https://img.youtube.com/vi/${youTubeId}/hqdefault.jpg` : null

  const finalImg = imgUrl ?? (anyMedia && !anyIsVideo ? anyMedia : null) ?? youTubeThumb
  const finalVideo = videoUrl ?? (anyMedia && anyIsVideo ? anyMedia : null)
  const showPlay = (isVideo || !!previewUrl) && (finalImg || finalVideo)

  // iOS Safari não renderiza primeiro frame de cross-origin video sem
  // seek explícito — #t=0.5 força.
  const videoSrc = finalVideo ? `${finalVideo}${finalVideo.includes("#t=") ? "" : "#t=0.5"}` : null

  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
      {finalImg ? (
        <img src={finalImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : videoSrc ? (
        <video
          src={videoSrc}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
        </div>
      )}
      {showPlay && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Play className="h-4 w-4 text-white drop-shadow" fill="white" />
        </div>
      )}
    </div>
  )
}

// ─── Preview Dialog (read-only) ────────────────────────────

function PreviewDialog({
  post, loading, onClose,
}: {
  post: SlimPost
  loading: boolean
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-xl border bg-background p-4 sm:rounded-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
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

        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          (() => {
            const targets = post.publishTargets.length > 0
              ? post.publishTargets
              : inferFallbackTargets(post)
            return (
              <div className="space-y-3">
                {targets.map((t) => (
                  <PostMockup key={t.raw} target={t} post={post} />
                ))}
                {post.publishTargets.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center px-2">
                    Sem &quot;Publicar em&quot; no Notion — preview inferido pelo título.
                  </p>
                )}
              </div>
            )
          })()
        )}

        {!loading && post.fullCaption && (
          <div className="mt-4 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm uppercase tracking-wider text-muted-foreground mb-1">Legenda</p>
            <p className="whitespace-pre-wrap text-base">{post.fullCaption}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Approval dialog (inline version of /approve/{token}) ──────────

function ApprovalDialog({
  post, onClose, onDecided,
}: {
  post: PendingPost
  onClose: () => void
  onDecided: () => void
}) {
  const [submitting, setSubmitting] = useState<"approved" | "changes_requested" | null>(null)
  const [showCommentBox, setShowCommentBox] = useState(false)
  const [comment, setComment] = useState("")

  if (!post.approvalToken) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={onClose}>
        <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-xl border bg-background p-4 sm:rounded-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-end mb-2">
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
          <div className="py-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-warning" />
            <p className="font-medium">Link de aprovação ainda não disponível</p>
            <p className="mt-2 text-base text-muted-foreground">
              A agência ainda não enviou esse post pra aprovação. Tente novamente em alguns minutos.
            </p>
          </div>
        </div>
      </div>
    )
  }

  async function decide(decision: "approved" | "changes_requested") {
    if (decision === "changes_requested" && !comment.trim()) {
      toast.error("Escreva o que precisa ajustar antes de enviar.")
      return
    }
    setSubmitting(decision)
    try {
      const res = await fetch(`/api/approve/${post.approvalToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment: comment.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          toast.error("Esse post já foi decidido.")
          onDecided()
          return
        }
        throw new Error(json.error ?? "Erro ao registrar decisão")
      }
      toast.success(decision === "approved" ? "Aprovado!" : "Comentário enviado!")
      onDecided()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-xl border bg-background p-4 sm:rounded-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-wider text-muted-foreground">Aprovação</p>
            <h3 className="text-xl truncate">{post.title || "Sem título"}</h3>
            <p className="text-sm text-muted-foreground">@{post.conta}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Mockup interativo per-platform — carrossel navegável, vídeo
            playable, feed com imagem em tamanho real. Cliente avalia o
            conteúdo na forma final antes de aprovar. Quando "Publicar em"
            vier vazio, inferimos pelo título pra não bloquear o preview. */}
        {(() => {
          const targets = post.publishTargets.length > 0
            ? post.publishTargets
            : inferFallbackTargets(post)
          return (
            <div className="mb-4 space-y-3">
              {targets.map((t) => (
                <PostMockup key={t.raw} target={t} post={post} />
              ))}
              {post.publishTargets.length === 0 && (
                <p className="text-xs text-muted-foreground text-center px-2">
                  Sem &quot;Publicar em&quot; no Notion — preview inferido pelo título.
                </p>
              )}
            </div>
          )
        })()}

        {/* Caption */}
        {post.fullCaption && (
          <div className="mb-4 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm uppercase tracking-wider text-muted-foreground mb-1">Legenda</p>
            <p className="whitespace-pre-wrap text-base">{post.fullCaption}</p>
          </div>
        )}

        {/* Decision UI */}
        {!showCommentBox ? (
          <div className="space-y-2">
            <Button
              size="lg"
              className="w-full bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => decide("approved")}
              disabled={submitting !== null}
            >
              {submitting === "approved" ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
              Aprovar
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => setShowCommentBox(true)}
              disabled={submitting !== null}
            >
              <MessageCircle className="h-5 w-5" />
              Pedir alterações
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border p-3 bg-card">
              <label className="text-base font-medium block mb-2">O que precisa ajustar?</label>
              <textarea
                autoFocus
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ex: trocar a thumb, ajustar a legenda..."
                rows={4}
                className="w-full rounded-md border bg-background p-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={submitting !== null}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setShowCommentBox(false); setComment("") }}
                disabled={submitting !== null}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={() => decide("changes_requested")}
                disabled={submitting !== null || !comment.trim()}
              >
                {submitting === "changes_requested" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                Enviar comentário
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Pill colorida por status. Cores casam com o flowchart Notion da
// agência (azul=em-curso, amarelo=aguardando-VP, marrom=aguardando-
// cliente, verde=concluído, vermelho=erro).
const STATUS_TONE: Record<string, string> = {
  brief_pending: "bg-warning/15 text-warning",
  script_drafting: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  awaiting_approval: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  revision_requested: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  recording: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  editing: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  archived: "bg-muted text-muted-foreground",
}

function ProductionsList({ productions }: { productions: ProductionItem[] }) {
  const { token } = useParams<{ token: string }>()

  if (productions.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-base text-muted-foreground">
            Nenhuma produção em andamento. Quando a agência criar um vídeo ou podcast, aparece aqui.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Grupos cobrem o ciclo completo. Cliente vê fluxo end-to-end em vez
  // de pular do "em produção" pra "publicado".
  const groups: Array<{ key: string; label: string; statuses: string[]; tone?: string }> = [
    { key: "awaiting", label: "Aguardando você", statuses: ["awaiting_approval", "brief_pending"], tone: "border-warning/40" },
    { key: "revision", label: "Em revisão (alteração pedida)", statuses: ["revision_requested"], tone: "border-orange-300" },
    { key: "production", label: "Em produção", statuses: ["script_drafting", "approved", "recording", "editing"] },
    { key: "delivered", label: "Entregues", statuses: ["delivered"], tone: "border-emerald-300" },
    { key: "published", label: "Publicados", statuses: ["published"] },
    { key: "archived", label: "Arquivados", statuses: ["archived"] },
  ]

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const items = productions.filter((p) => group.statuses.includes(p.status))
        if (items.length === 0) return null
        return (
          <div key={group.key}>
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label} ({items.length})
            </p>
            <div className="space-y-2">
              {items.map((p) => (
                <ProductionCard key={p.id} p={p} token={token} groupBorder={group.tone} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

// Aba Briefing — lê /api/c/[token]/briefing on-demand (não vem no fetch
// inicial pra não atrasar load do calendário). Mostra propriedades da
// page Notion configurada como key-value pairs, agrupadas por seção
// implícita do título da prop.
function BriefingPanel() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<BriefingData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/c/${token}/briefing`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setData(j) })
      .catch(() => { if (!cancelled) setData({ configured: true, error: "Erro ao carregar" }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!data?.configured) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-base text-muted-foreground">
            Briefing ainda não configurado. Peça pra agência adicionar o link da página de briefing.
          </p>
        </CardContent>
      </Card>
    )
  }
  if (data.error) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-warning" />
          <p className="text-base text-muted-foreground">{data.error}</p>
        </CardContent>
      </Card>
    )
  }
  const fields = data.fields ?? []
  return (
    <div className="space-y-3">
      {data.lastEditedTime && (
        <p className="text-[12px] text-muted-foreground">
          Última atualização: {new Date(data.lastEditedTime).toLocaleString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          {data.pageUrl && (
            <> · <a href={data.pageUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Ver no Notion</a></>
          )}
        </p>
      )}
      {fields.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-base text-muted-foreground">
            Briefing está vazio ainda. Volte aqui depois que você responder pra agência.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {fields.map((f) => (
            <div key={f.name} className="px-4 py-3">
              <p className="text-[12px] uppercase tracking-wider text-muted-foreground">{f.name}</p>
              <BriefingValue value={f.value} type={f.type} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Aba Performance — métricas agregadas dos posts publicados nos últimos
// 90d (alcance/likes/comentários/saves). Dados vêm do cron de analytics
// que sync com IG Graph API. Tela mostra big-number cards + top 5 posts
// por alcance + lista recente.
function PerformancePanel() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/c/${token}/metrics`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setData(j) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!data || data.summary.posts === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-base text-muted-foreground">
            Sem dados de performance ainda. Métricas começam a aparecer alguns dias depois das primeiras publicações.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Posts" value={data.summary.posts} />
        <MetricCard label="Alcance" value={data.summary.reach} />
        <MetricCard label="Curtidas" value={data.summary.likes} />
        <MetricCard label="Comentários" value={data.summary.comments} />
        <MetricCard label="Salvos" value={data.summary.saves} />
      </div>
      <p className="text-[12px] text-muted-foreground">
        Últimos {data.windowDays} dias.
        {data.summary.lastSyncedAt && (
          <> Última atualização: {new Date(data.summary.lastSyncedAt).toLocaleString("pt-BR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}</>
        )}
      </p>

      {data.topPosts.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            Top 5 por alcance
          </p>
          <div className="space-y-2">
            {data.topPosts.map((p, i) => (
              <Card key={p.pageId + i}>
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium">{p.title || "Sem título"}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {p.platform ?? "—"} · {new Date(p.publishedAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-3 text-right text-[12px]">
                    <div>
                      <p className="font-semibold tabular-nums">{p.reach.toLocaleString("pt-BR")}</p>
                      <p className="text-muted-foreground">alcance</p>
                    </div>
                    <div>
                      <p className="font-semibold tabular-nums">{p.likes.toLocaleString("pt-BR")}</p>
                      <p className="text-muted-foreground">curtidas</p>
                    </div>
                  </div>
                  {p.postUrl && (
                    <a href={p.postUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Ver post">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value.toLocaleString("pt-BR")}</p>
    </div>
  )
}

function BriefingValue({ value, type }: { value: BriefingField["value"]; type: string }) {
  if (value == null) return <p className="text-sm text-muted-foreground">—</p>
  if (Array.isArray(value)) {
    // Files: lista de URLs clicáveis. Outros arrays: pills.
    const isUrlList = type === "files" && value.every((v) => typeof v === "string" && /^https?:/.test(v))
    if (isUrlList) {
      return (
        <ul className="mt-1 space-y-0.5">
          {value.map((u, i) => (
            <li key={i}>
              <a href={String(u)} target="_blank" rel="noopener noreferrer" className="text-sm underline hover:no-underline break-all">
                {String(u)}
              </a>
            </li>
          ))}
        </ul>
      )
    }
    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {value.map((v, i) => (
          <span key={i} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[12px]">
            {String(v)}
          </span>
        ))}
      </div>
    )
  }
  if (type === "date" && typeof value === "string") {
    return <p className="mt-1 text-base">{new Date(value).toLocaleDateString("pt-BR")}</p>
  }
  if ((type === "url" || type === "email") && typeof value === "string") {
    const href = type === "email" ? `mailto:${value}` : value
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 block text-base underline hover:no-underline break-all">
        {value}
      </a>
    )
  }
  return <p className="mt-1 whitespace-pre-wrap text-base">{String(value)}</p>
}

function ProductionCard({
  p, token, groupBorder,
}: {
  p: ProductionItem
  token: string
  groupBorder?: string
}) {
  // Timeline derivada das datas que temos. Mostra a linha do tempo
  // resumida em vez de "1 status no presente" — cliente vê de onde
  // veio e pra onde vai.
  const events: Array<{ label: string; date: string | null; done: boolean }> = [
    { label: "Solicitado", date: p.createdAt ?? null, done: true },
    { label: "Gravação", date: p.recordingDate ?? null, done: ["recording", "editing", "delivered", "published", "archived"].includes(p.status) },
    { label: "Entrega", date: p.deliveryDate ?? null, done: ["delivered", "published", "archived"].includes(p.status) },
    { label: "Publicação", date: p.publishDate ?? null, done: ["published", "archived"].includes(p.status) },
  ]
  const hasAnyDate = events.some((e) => e.date)
  const tone = STATUS_TONE[p.status] ?? "bg-muted text-muted-foreground"
  const canDownloadVertical = !!p.hasVerticalMedia && (p.status === "delivered" || p.status === "published" || p.status === "archived")
  const canDownloadHorizontal = !!p.hasHorizontalMedia && (p.status === "delivered" || p.status === "published" || p.status === "archived")

  return (
    <Card className={cn("overflow-hidden", groupBorder)}>
      <CardContent className="space-y-3 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Play className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium">{p.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", tone)}>
                {p.statusLabel}
              </span>
              {p.notionStatus && p.notionStatus !== p.statusLabel && (
                /* Status detalhado do Notion ("Edição Vertical",
                   "Aguardando Alinhamento" etc) — texto livre, fonte
                   leve. Pareado com pill de status pro cliente entender
                   contexto. */
                <span className="text-[12px] text-muted-foreground">· {p.notionStatus}</span>
              )}
              {p.specialistName && (
                <span className="text-[12px] text-muted-foreground">· {p.specialistName}</span>
              )}
            </div>
            {p.topic && (
              <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{p.topic}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {p.pendingApprovalToken && (
              <Button size="sm" asChild>
                <a href={`/approve/${p.pendingApprovalToken}`}>Revisar</a>
              </Button>
            )}
          </div>
        </div>

        {hasAnyDate && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-[12px] text-muted-foreground">
            {events.filter((e) => e.date).map((e) => (
              <span key={e.label} className={cn("inline-flex items-center gap-1", e.done && "text-foreground")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", e.done ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                {e.label}: {shortDate(e.date!)}
              </span>
            ))}
          </div>
        )}

        {(canDownloadVertical || canDownloadHorizontal || p.finalVideoUrl) && (
          <div className="flex flex-wrap gap-1.5 border-t pt-2">
            {canDownloadVertical && (
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/c/${token}/production/${p.id}/deliverable?orientation=vertical`}>
                  <Download className="h-3.5 w-3.5" />
                  Vertical (9:16)
                </a>
              </Button>
            )}
            {canDownloadHorizontal && (
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/c/${token}/production/${p.id}/deliverable?orientation=horizontal`}>
                  <Download className="h-3.5 w-3.5" />
                  Horizontal (16:9)
                </a>
              </Button>
            )}
            {p.finalVideoUrl && (
              <Button size="sm" variant="ghost" asChild>
                <a href={p.finalVideoUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver vídeo final
                </a>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
