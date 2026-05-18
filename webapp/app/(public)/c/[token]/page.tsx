"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import useEmblaCarousel from "embla-carousel-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, AlertTriangle, Loader2, Clock, Building2, MessageCircle, ChevronLeft, ChevronRight, ExternalLink, Play, X, Download, Plus, Sparkles, Share2, Bell, BellOff } from "lucide-react"
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
    // White-label (Pilar 7) — quando setados, sobreescrevem paleta e
    // tipografia do portal pra que a marca da agência fique no centro.
    agencyPrimaryColor?: string | null
    agencyAccentColor?: string | null
    agencyFontFamily?: string | null
    // Próxima reunião (Pilar 7.4) — null = sem reunião marcada, card
    // escondido.
    nextMeetingAt?: string | null
    nextMeetingUrl?: string | null
    nextMeetingNotes?: string | null
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

type MonthlyBucket = {
  posts: number
  likes: number
  comments: number
  reach: number
  saves: number
}

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
  monthly?: {
    thisMonthLabel: string
    lastMonthLabel: string
    thisMonth: MonthlyBucket
    lastMonth: MonthlyBucket
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
  // Wrapped (Pilar 7.6) — relatório mensal do mês passado, swipável.
  // Aparece como banner CTA nos primeiros 7 dias do mês seguinte quando
  // há posts publicados pra contar. Carregado em paralelo ao calendar.
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [wrappedOpen, setWrappedOpen] = useState(false)

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
    // Carrega metrics em paralelo pro Wrapped (banner aparece dia 1-7
    // do mês). Erro silencioso — sem metrics, banner só não aparece.
    fetch(`/api/c/${token}/metrics`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setMetrics(j) })
      .catch(() => {})
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

  // White-label real (Pilar 7) — quando a agência setou cor/fonte
  // próprias, sobreescrevemos as CSS vars do portal. CSS vars são
  // herdadas, então toda utility class (bg-primary, ring-primary,
  // text-primary etc) passa a usar a cor da agência sem alterar
  // markup. Validação HEX está no PATCH /api/clients/[id]. Cast pra
  // Record porque CSSProperties não tipa CSS custom properties.
  const wlStyle = {} as Record<string, string>
  if (data.client.agencyPrimaryColor) {
    wlStyle["--primary"] = data.client.agencyPrimaryColor
    wlStyle["--ring"] = data.client.agencyPrimaryColor
  }
  if (data.client.agencyAccentColor) {
    wlStyle["--accent"] = data.client.agencyAccentColor
  }
  if (data.client.agencyFontFamily) {
    wlStyle.fontFamily = `"${data.client.agencyFontFamily}", system-ui, sans-serif`
  }

  return (
    <div className="relative min-h-screen bg-background pb-20" style={wlStyle}>
      {/* Google Font dinâmica da agência. Carregamos só se setado.
          Família é sanitizada pelo PATCH (regex letras/espaços/hífens). */}
      {data.client.agencyFontFamily && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(data.client.agencyFontFamily)}:wght@400;500;600;700&display=swap`}
        />
      )}
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
          {/* Status de pending vive no StatusBanner + HeroPendingCTA logo
              abaixo do header (Pilar 7.1 + 7.5 do brand doc). Não duplicar aqui. */}
          {/* Push toggle (Pilar 7 transversal). Aparece só se o servidor
              tiver VAPID configurada (botão fica escondido senão). */}
          <PushToggle token={token} />
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
        {/* Status banner — uma linha agregada, sempre visível. Pilar 7.5
            do brand doc: "Tudo em dia ✓ / X pendências · próx entrega · etc". */}
        <StatusBanner data={data} />

        {/* Hero approval — quando há posts pendentes, vira a CTA dominante
            (Pilar 7.1: "posts pra aprovar como CTA principal"). Cobre a
            tela do mobile e desktop pra não passar despercebido. */}
        {data.pending.length > 0 && (
          <HeroPendingCTA
            pending={data.pending}
            onOpen={setSelectedPending}
          />
        )}

        {/* Próxima reunião (Pilar 7.4). Aparece só quando agência marcou
            uma. Quando vazio, esconde — não polui o portal com card vazio. */}
        {data.client.nextMeetingAt && (
          <NextMeetingCard
            meetingAt={data.client.nextMeetingAt}
            meetingUrl={data.client.nextMeetingUrl ?? null}
            meetingNotes={data.client.nextMeetingNotes ?? null}
          />
        )}

        {/* Wrapped CTA (Pilar 7.6) — banner "Seu relatório de [mês] chegou"
            que abre o modal swipable. Aparece nos primeiros 7 dias do mês
            seguinte quando há posts publicados pra contar. */}
        {shouldShowWrapped(metrics) && (
          <WrappedCTA
            monthLabel={metrics!.monthly!.lastMonthLabel}
            postCount={metrics!.monthly!.lastMonth.posts}
            onOpen={() => setWrappedOpen(true)}
          />
        )}

        {/* Solicitações em andamento (elemento adicional pós-revisão dos 6).
            Top-level pra sinalizar "agência tá trabalhando pra mim". Mostra
            só quando há produções ativas (não-published, não-archived). */}
        {(data.productions ?? []).filter((p) => p.status !== "published" && p.status !== "archived").length > 0 && (
          <ProductionsHero
            productions={data.productions ?? []}
            onSeeAll={() => setTab("producoes")}
          />
        )}

        {/* Stats bento — só em desktop, e só quando NÃO há pending hero
            (senão duplica visualmente). No mobile calendar+tabs cobrem a info. */}
        {data.pending.length === 0 && (
          <div className="mb-4 hidden gap-3 lg:grid lg:grid-cols-3">
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
        )}

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

      {/* Wrapped modal swipável (Pilar 7.6) */}
      {wrappedOpen && metrics?.monthly && (
        <WrappedModal
          clientName={data.client.name}
          monthLabel={metrics.monthly.lastMonthLabel}
          bucket={metrics.monthly.lastMonth}
          prevBucket={null /* sem mês-antes-do-passado por ora */}
          topPost={metrics.topPosts[0] ?? null}
          onClose={() => setWrappedOpen(false)}
        />
      )}
    </div>
  )
}

// Trigger pro banner Wrapped — só nos primeiros 7 dias do mês seguinte
// E quando há posts publicados pra contar. Fora dessa janela o relatório
// fica no PerformancePanel mas sem virar CTA dominante (não polui o
// portal o mês inteiro com banner de mês passado).
function shouldShowWrapped(metrics: MetricsData | null): boolean {
  if (!metrics?.monthly) return false
  const day = new Date().getDate()
  if (day > 7) return false
  return metrics.monthly.lastMonth.posts > 0
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

// Status agregado em 1 linha (Pilar 7.5 do brand doc). Substitui o
// "X aguardando" do header por uma frase que cobre múltiplos sinais:
// pendências + próxima entrega + próxima reunião + em produção.
function StatusBanner({ data }: { data: CalendarData }) {
  const pending = data.pending.length
  const nextHint = nextScheduledHint(data.scheduled)
  const productionCount = data.productions?.filter((p) => p.status !== "published").length ?? 0
  const hasProduction = productionCount > 0
  const meetingHint = nextMeetingHint(data.client.nextMeetingAt ?? null)

  const allGood = pending === 0 && !hasProduction
  const tone = pending > 0 ? "warning" : "ok"

  return (
    <div className={cn(
      "mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border px-4 py-2.5 text-sm",
      tone === "warning"
        ? "border-warning/40 bg-warning/5 text-warning"
        : "border-success/30 bg-success/5 text-success"
    )}>
      <span className="inline-flex items-center gap-1.5 font-medium">
        {allGood ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
          </span>
        )}
        {pending > 0
          ? (pending === 1 ? "1 post pra aprovar" : `${pending} posts pra aprovar`)
          : "Tudo em dia"}
      </span>
      {nextHint && (
        <span className="text-muted-foreground">
          <span className="mx-1 opacity-40">·</span>
          próxima entrega {nextHint.replace("próximo ", "")}
        </span>
      )}
      {meetingHint && (
        <span className="text-muted-foreground">
          <span className="mx-1 opacity-40">·</span>
          próx reunião {meetingHint}
        </span>
      )}
      {hasProduction && (
        <span className="text-muted-foreground">
          <span className="mx-1 opacity-40">·</span>
          {productionCount} em produção
        </span>
      )}
    </div>
  )
}

// Card de próxima reunião (Pilar 7.4). Aparece quando agência marcou
// reunião com cliente. Mostra data legível + countdown + link join +
// notas. Esconde por completo quando não há reunião marcada — não vamos
// poluir o portal com placeholder vazio.
function NextMeetingCard({
  meetingAt, meetingUrl, meetingNotes,
}: {
  meetingAt: string
  meetingUrl: string | null
  meetingNotes: string | null
}) {
  const date = new Date(meetingAt)
  const diffMs = date.getTime() - Date.now()
  const past = diffMs < 0
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  const hours = Math.floor(diffMs / (60 * 60 * 1000))

  let countdown: string
  if (past) {
    countdown = "passou"
  } else if (hours < 1) {
    countdown = "agora"
  } else if (hours < 24) {
    countdown = `em ${hours}h`
  } else if (days === 1) {
    countdown = "amanhã"
  } else {
    countdown = `em ${days} dias`
  }

  const longDate = date.toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-5">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary">
            Próxima reunião · {countdown}
          </p>
          <p className="mt-1 text-base font-medium leading-tight first-letter:uppercase">
            {longDate}
          </p>
          {meetingNotes && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              {meetingNotes}
            </p>
          )}
        </div>
        {meetingUrl && !past && (
          <Button asChild size="sm" className="shrink-0">
            <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
              Entrar na reunião
              <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

// Helper compacto pro StatusBanner (formato "30/mai" ou "amanhã"/"hoje").
function nextMeetingHint(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const diffMs = date.getTime() - Date.now()
  if (diffMs < 0) return null
  const hours = Math.floor(diffMs / (60 * 60 * 1000))
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (hours < 24) return "hoje"
  if (days === 1) return "amanhã"
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")
}

// Produções em andamento como bloco top-level — antes era só a aba
// "Produções". Dá pro cliente sinal de "agência tá trabalhando pra mim"
// sem precisar trocar de aba. Mostra até 3 cards compactos + atalho
// "ver todas" que pula pra aba.
function ProductionsHero({
  productions, onSeeAll,
}: {
  productions: ProductionItem[]
  onSeeAll: () => void
}) {
  const active = productions.filter((p) => p.status !== "published" && p.status !== "archived")
  const preview = active.slice(0, 3)

  return (
    <div className="mb-6 rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Em produção pra você
          </p>
          <p className="text-base">
            {active.length === 1 ? "1 produção em andamento" : `${active.length} produções em andamento`}
          </p>
        </div>
        {active.length > preview.length && (
          <button
            onClick={onSeeAll}
            className="text-sm font-medium text-primary hover:underline"
          >
            Ver todas ({active.length}) →
          </button>
        )}
      </div>
      <div className="divide-y">
        {preview.map((p) => (
          <button
            key={p.id}
            onClick={onSeeAll}
            className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40"
          >
            <span className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              STATUS_TONE[p.status] ?? "bg-muted text-muted-foreground",
            )}>
              {p.statusLabel}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{p.title}</span>
            {p.publishDate && (
              <span className="shrink-0 text-[12px] text-muted-foreground">
                ao ar {shortDate(p.publishDate)}
              </span>
            )}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  )
}

// Banner que vira CTA pro Wrapped (Pilar 7.6). Tom Soberano + Sábio,
// frase curta com ritmo editorial. Aparece só dia 1-7 do mês seguinte.
function WrappedCTA({
  monthLabel, postCount, onOpen,
}: {
  monthLabel: string
  postCount: number
  onOpen: () => void
}) {
  return (
    <button
      onClick={onOpen}
      className="group mb-6 block w-full overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.10] via-primary/[0.04] to-background text-left transition-all hover:border-primary/60"
    >
      <div className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary">
            Novo relatório · {postCount} {postCount === 1 ? "post" : "posts"}
          </p>
          <p className="mt-0.5 text-base font-medium leading-tight first-letter:uppercase">
            Seu {monthLabel.toLowerCase()} chegou — abra pra ver
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
          Abrir
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  )
}

// Modal full-screen swipable estilo Spotify Wrapped (Pilar 7.6).
// 5 slides editoriais. Mobile = swipe. Desktop = botões prev/next.
// "Compartilhar" copia link do portal pra clipboard (cliente final
// encaminha pros sócios dele — viralidade horizontal da tese).
function WrappedModal({
  clientName, monthLabel, bucket, prevBucket, topPost, onClose,
}: {
  clientName: string
  monthLabel: string
  bucket: MonthlyBucket
  prevBucket: MonthlyBucket | null
  topPost: MetricsData["topPosts"][number] | null
  onClose: () => void
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "center" })
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!emblaApi) return
    const onSelect = () => setIdx(emblaApi.selectedScrollSnap())
    emblaApi.on("select", onSelect)
    onSelect()
    return () => { emblaApi.off("select", onSelect) }
  }, [emblaApi])

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi])
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi])

  function share() {
    if (typeof window === "undefined") return
    navigator.clipboard.writeText(window.location.href)
      .then(() => toast.success("Link do portal copiado — manda pros sócios"))
      .catch(() => toast.error("Não consegui copiar o link"))
  }

  const reachDelta = prevBucket && prevBucket.reach > 0
    ? Math.round(((bucket.reach - prevBucket.reach) / prevBucket.reach) * 100)
    : null

  const slides = [
    {
      key: "cover",
      content: (
        <div className="text-center">
          <Sparkles className="mx-auto h-10 w-10 text-primary" />
          <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
            Relatório mensal
          </p>
          <h2 className="mt-3 text-[clamp(32px,5vw,52px)] font-light leading-[1.05] tracking-tight first-letter:uppercase">
            {monthLabel}
          </h2>
          <p className="mt-2 text-[18px] text-muted-foreground">em {clientName}</p>
        </div>
      ),
    },
    {
      key: "posts",
      content: (
        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Foram publicados
          </p>
          <p className="mt-3 text-[clamp(80px,14vw,160px)] font-light leading-none text-primary tabular-nums">
            {bucket.posts}
          </p>
          <p className="mt-2 text-[20px]">
            {bucket.posts === 1 ? "post" : "posts"} no feed
          </p>
        </div>
      ),
    },
    {
      key: "reach",
      content: (
        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Alcance total
          </p>
          <p className="mt-3 text-[clamp(56px,9vw,100px)] font-light leading-none tabular-nums">
            {bucket.reach.toLocaleString("pt-BR")}
          </p>
          <p className="mt-2 text-[18px] text-muted-foreground">pessoas viram o conteúdo</p>
          {reachDelta !== null && (
            <p className={cn(
              "mt-4 text-[15px]",
              reachDelta > 0 ? "text-success" : reachDelta < 0 ? "text-destructive" : "text-muted-foreground"
            )}>
              {reachDelta > 0 ? "▲" : reachDelta < 0 ? "▼" : "—"} {Math.abs(reachDelta)}% vs mês passado
            </p>
          )}
        </div>
      ),
    },
    {
      key: "engagement",
      content: (
        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Engajamento
          </p>
          <div className="mt-6 grid grid-cols-3 gap-4 sm:gap-8">
            <div>
              <p className="text-[clamp(36px,6vw,56px)] font-light leading-none tabular-nums">{bucket.likes.toLocaleString("pt-BR")}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">curtidas</p>
            </div>
            <div>
              <p className="text-[clamp(36px,6vw,56px)] font-light leading-none tabular-nums">{bucket.comments.toLocaleString("pt-BR")}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">comentários</p>
            </div>
            <div>
              <p className="text-[clamp(36px,6vw,56px)] font-light leading-none tabular-nums">{bucket.saves.toLocaleString("pt-BR")}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">salvos</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "top",
      content: (
        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Post que mais alcançou
          </p>
          {topPost ? (
            <>
              <p className="mx-auto mt-4 max-w-md text-[22px] leading-tight">
                &ldquo;{topPost.title || "Sem título"}&rdquo;
              </p>
              <p className="mt-3 text-[clamp(40px,7vw,64px)] font-light leading-none tabular-nums text-primary">
                {topPost.reach.toLocaleString("pt-BR")}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">de alcance · {topPost.platform ?? ""}</p>
              {topPost.postUrl && (
                <a
                  href={topPost.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                >
                  Ver o post <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </>
          ) : (
            <p className="mt-4 text-muted-foreground">Sem dados de alcance ainda.</p>
          )}
        </div>
      ),
    },
    {
      key: "share",
      content: (
        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
            Manda pros sócios
          </p>
          <h3 className="mt-4 text-[clamp(28px,4.5vw,42px)] font-light leading-tight">
            Compartilhe o relatório
          </h3>
          <p className="mt-3 text-[16px] text-muted-foreground">
            O link do portal abre direto neste mês.
          </p>
          <Button size="lg" onClick={share} className="mt-7">
            <Share2 className="mr-2 h-4 w-4" />
            Copiar link do portal
          </Button>
        </div>
      ),
    },
  ]

  // Fecha com ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft") emblaApi?.scrollPrev()
      else if (e.key === "ArrowRight") emblaApi?.scrollNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, emblaApi])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md">
      {/* Top bar com close + progresso */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex flex-1 gap-1">
          {slides.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full bg-primary transition-all duration-300",
                  i < idx && "w-full",
                  i === idx && "w-full",
                  i > idx && "w-0"
                )}
              />
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Carousel viewport */}
      <div className="relative flex-1 overflow-hidden" ref={emblaRef}>
        <div className="flex h-full">
          {slides.map((s) => (
            <div
              key={s.key}
              className="flex h-full min-w-0 flex-[0_0_100%] items-center justify-center px-6 sm:px-12"
            >
              <div className="max-w-2xl">{s.content}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Nav buttons (desktop) */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={scrollPrev}
          disabled={idx === 0}
          className="text-muted-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Anterior
        </Button>
        <p className="text-[12px] text-muted-foreground tabular-nums">
          {idx + 1} / {slides.length}
        </p>
        <Button
          variant={idx === slides.length - 1 ? "default" : "ghost"}
          size="sm"
          onClick={idx === slides.length - 1 ? onClose : scrollNext}
        >
          {idx === slides.length - 1 ? "Fechar" : "Próximo"}
          {idx !== slides.length - 1 && <ChevronRight className="ml-1 h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

// Hero da aprovação (Pilar 7.1 do brand doc). Quando há pending, é a CTA
// dominante — full-width, lista compacta dos primeiros 3, botão grande.
// Quando vazio, este componente não renderiza (StatusBanner mostra "Tudo
// em dia ✓").
function HeroPendingCTA({
  pending, onOpen,
}: {
  pending: PendingPost[]
  onOpen: (p: PendingPost) => void
}) {
  const preview = pending.slice(0, 3)
  const overflow = pending.length - preview.length

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-warning/40 bg-gradient-to-br from-warning/[0.08] to-warning/[0.02]">
      <div className="px-5 py-5 sm:px-7 sm:py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-warning">
              Aguardando você
            </p>
            <h2 className="mt-1 text-[clamp(22px,3vw,30px)] font-medium leading-tight">
              {pending.length === 1
                ? "1 post pronto pra sua aprovação"
                : `${pending.length} posts prontos pra sua aprovação`}
            </h2>
          </div>
          <Button
            size="lg"
            onClick={() => onOpen(pending[0])}
            className="bg-warning text-warning-foreground hover:bg-warning/90"
          >
            Revisar primeiro
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          {preview.map((p) => (
            <button
              key={p.pageId}
              onClick={() => onOpen(p)}
              className="group flex w-full items-center gap-3 rounded-lg border border-warning/20 bg-card/80 p-3 text-left transition-colors hover:border-warning/50 hover:bg-card"
            >
              <PostThumb post={p} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.publishTargets.slice(0, 2).map((t) => (
                    <Badge key={t.raw} className={cn("text-[9px]", platformClass(t.platform))}>
                      {t.raw}
                    </Badge>
                  ))}
                  {p.publishTargets.length > 2 && (
                    <span className="text-[11px] text-muted-foreground">
                      +{p.publishTargets.length - 2}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm font-medium">
                  {p.title || "Sem título"}
                </p>
                {p.scheduledDate && (
                  <p className="text-[12px] text-muted-foreground">
                    <Clock className="mr-0.5 inline h-3 w-3" />
                    {new Date(p.scheduledDate).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>

        {overflow > 0 && (
          <p className="mt-3 text-center text-[12px] text-muted-foreground">
            + {overflow} {overflow === 1 ? "outro" : "outros"} na aba Pendentes abaixo
          </p>
        )}
      </div>
    </div>
  )
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

        {/* Decision UI — slide-to-approve em mobile (Pilar 7 transversal),
            botão clássico em desktop. Microinteração reforça compromisso
            ('decidi aprovar') e impede aprovação acidental num scroll. */}
        {!showCommentBox ? (
          <div className="space-y-2">
            <SlideToApprove
              loading={submitting === "approved"}
              disabled={submitting !== null}
              onConfirm={() => decide("approved")}
            />
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

// PushToggle (Pilar 7 transversal: "notificação push PWA"). Cliente
// liga/desliga push do navegador. Esconde quando navegador não suporta
// ou quando servidor não tem VAPID. Service worker em /public/sw.js.
function PushToggle({ token }: { token: string }) {
  const [supported, setSupported] = useState(false)
  const [vapidKey, setVapidKey] = useState<string | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return
    setSupported(true)
    fetch(`/api/c/${token}/push`)
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.enabled || !data.vapidKey) return
        setVapidKey(data.vapidKey)
        // Detecta se este browser já tem subscription ativa
        try {
          const reg = await navigator.serviceWorker.getRegistration()
          const sub = await reg?.pushManager.getSubscription()
          setIsSubscribed(!!sub)
        } catch { /* permission denied / quirk */ }
      })
      .catch(() => {})
  }, [token])

  async function enable() {
    if (!vapidKey) return
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        toast.error("Você precisa permitir notificações no navegador.")
        return
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast pra BufferSource — TS 5.7 fica chato com Uint8Array<ArrayBufferLike>
        // (SharedArrayBuffer vs ArrayBuffer). Runtime aceita ambos.
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })
      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      const res = await fetch(`/api/c/${token}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          userAgent: navigator.userAgent,
        }),
      })
      if (!res.ok) throw new Error("Erro ao registrar")
      setIsSubscribed(true)
      toast.success("Notificações ativadas")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro")
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch(`/api/c/${token}/push?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: "DELETE",
        })
        await sub.unsubscribe()
      }
      setIsSubscribed(false)
      toast.success("Notificações desativadas")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro")
    } finally {
      setBusy(false)
    }
  }

  if (!supported || !vapidKey) return null

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={isSubscribed ? disable : enable}
      disabled={busy}
      className="shrink-0"
      aria-label={isSubscribed ? "Desativar notificações" : "Ativar notificações"}
      title={isSubscribed ? "Notificações ativadas — clique pra desativar" : "Ativar notificações push"}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isSubscribed ? (
        <Bell className="h-4 w-4 text-primary" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
    </Button>
  )
}

// VAPID public key vem como base64 URL-safe; PushManager.subscribe
// quer Uint8Array. Conversão padrão (snippet do MDN web-push docs).
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i)
  return out
}

// Slide-to-approve (Pilar 7 transversal: "microinteractions premium").
// Mobile: cliente arrasta o thumb pra direita até passar 85% do trilho
// → confirma. Desktop: também funciona via mouse, mas pra teclado
// aceita Enter (acessível). Mantém o handle visualmente focável.
function SlideToApprove({
  onConfirm, loading, disabled,
}: {
  onConfirm: () => void
  loading: boolean
  disabled: boolean
}) {
  const [progress, setProgress] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const trackRef = useState<HTMLDivElement | null>(null)
  const [trackEl, setTrackEl] = trackRef
  const THRESHOLD = 0.85 // arrasta 85% pra confirmar

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || loading || confirming) return
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const trackW = trackEl?.clientWidth ?? 320
    const handleW = handle.clientWidth
    const maxDx = trackW - handleW - 8 /* padding interno */

    function onMove(ev: PointerEvent) {
      const dx = Math.max(0, Math.min(maxDx, ev.clientX - startX))
      setProgress(dx / maxDx)
    }
    function onUp() {
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onUp)
      handle.removeEventListener("pointercancel", onUp)
      setProgress((p) => {
        if (p >= THRESHOLD) {
          setConfirming(true)
          onConfirm()
          return 1
        }
        return 0 // snap back
      })
    }
    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onUp)
    handle.addEventListener("pointercancel", onUp)
  }

  // Reset visual quando submitter resolve (success ou erro abre de novo).
  useEffect(() => {
    if (!loading && confirming) {
      const t = setTimeout(() => { setConfirming(false); setProgress(0) }, 200)
      return () => clearTimeout(t)
    }
  }, [loading, confirming])

  const passed = progress >= THRESHOLD || confirming || loading

  return (
    <div
      ref={setTrackEl}
      className={cn(
        "relative h-14 w-full overflow-hidden rounded-full border bg-success/10 transition-colors",
        disabled && "opacity-50",
        passed && "bg-success/20"
      )}
    >
      {/* Trilho preenchido — cresce com o drag */}
      <div
        className="absolute inset-y-0 left-0 bg-success/30 transition-[width] duration-100"
        style={{ width: `${Math.max(8, progress * 100)}%` }}
        aria-hidden
      />
      {/* Label central */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium uppercase tracking-wider text-success">
        {loading || confirming
          ? "Aprovando..."
          : progress > 0.1
            ? `${Math.round(progress * 100)}%`
            : "Arraste pra aprovar →"}
      </div>
      {/* Handle (thumb) — onde o usuário segura/arrasta */}
      <button
        type="button"
        disabled={disabled || loading || confirming}
        onPointerDown={onPointerDown}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled && !loading) {
            e.preventDefault()
            setConfirming(true)
            onConfirm()
          }
        }}
        aria-label="Arraste pra aprovar — ou Enter pra confirmar"
        className={cn(
          "absolute top-1 bottom-1 left-1 flex aspect-square items-center justify-center rounded-full bg-success text-success-foreground shadow-md transition-transform",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2",
          (disabled || loading) && "cursor-not-allowed"
        )}
        style={{
          transform: `translateX(calc(${progress * 100}% * ${trackEl ? (trackEl.clientWidth - 56) / trackEl.clientWidth : 0.85}))`,
        }}
      >
        {loading || confirming ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-5 w-5" />
        )}
      </button>
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
      {/* Comparativo mensal (Pilar 7.2): este mês vs mês passado lado a
          lado, com delta % visível. Substitui o "métricas 90d flat" sem
          contexto. */}
      {data.monthly && (
        <MonthlyComparison
          label={data.monthly.thisMonthLabel}
          lastLabel={data.monthly.lastMonthLabel}
          thisMonth={data.monthly.thisMonth}
          lastMonth={data.monthly.lastMonth}
        />
      )}

      <div>
        <p className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          Total dos últimos {data.windowDays} dias
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard label="Posts" value={data.summary.posts} />
          <MetricCard label="Alcance" value={data.summary.reach} />
          <MetricCard label="Curtidas" value={data.summary.likes} />
          <MetricCard label="Comentários" value={data.summary.comments} />
          <MetricCard label="Salvos" value={data.summary.saves} />
        </div>
        {data.summary.lastSyncedAt && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Última atualização: {new Date(data.summary.lastSyncedAt).toLocaleString("pt-BR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>

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

// Comparativo "este mês vs passado" (Pilar 7.2). Cada métrica com delta
// percentual + seta. Quando mês passado = 0, mostra "novo" em vez de
// dividir por zero. Cor: verde quando subiu, vermelho quando desceu,
// cinza quando empate.
function MonthlyComparison({
  label, lastLabel, thisMonth, lastMonth,
}: {
  label: string
  lastLabel: string
  thisMonth: MonthlyBucket
  lastMonth: MonthlyBucket
}) {
  const items: Array<{ key: keyof MonthlyBucket; label: string }> = [
    { key: "posts", label: "Posts" },
    { key: "reach", label: "Alcance" },
    { key: "likes", label: "Curtidas" },
    { key: "comments", label: "Comentários" },
    { key: "saves", label: "Salvos" },
  ]
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="text-foreground capitalize">{label}</span>
          <span className="ml-1.5 font-normal normal-case text-muted-foreground">
            vs {lastLabel.toLowerCase()}
          </span>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => {
          const cur = thisMonth[it.key]
          const prev = lastMonth[it.key]
          const diff = cur - prev
          const pct = prev === 0
            ? (cur > 0 ? null : 0)
            : Math.round((diff / prev) * 100)
          const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat"
          return (
            <div key={it.key} className="rounded-xl border bg-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{it.label}</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">{cur.toLocaleString("pt-BR")}</p>
              <p className={cn(
                "mt-1 text-[12px] tabular-nums",
                dir === "up" && "text-success",
                dir === "down" && "text-destructive",
                dir === "flat" && "text-muted-foreground",
              )}>
                {dir === "up" && "▲ "}
                {dir === "down" && "▼ "}
                {dir === "flat" && "— "}
                {pct === null
                  ? "novo"
                  : pct === 0
                    ? "igual"
                    : `${Math.abs(pct)}% ${dir === "down" ? "menos" : "mais"} que mês passado`}
              </p>
            </div>
          )
        })}
      </div>
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
