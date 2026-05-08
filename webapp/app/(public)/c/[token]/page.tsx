"use client"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, AlertTriangle, Loader2, Clock, Building2, MessageCircle, ChevronLeft, ChevronRight, ExternalLink, Play, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

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
  updatedAt: string
  pendingApprovalToken: string | null
}

type CalendarData = {
  client: { name: string; logoUrl: string | null }
  pending: PendingPost[]
  scheduled: ScheduledPost[]
  past: PastPost[]
  productions?: ProductionItem[]
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

type Tab = "pendentes" | "agendados" | "publicados" | "producoes"

export default function ClientCalendarPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("pendentes")
  const [selectedPending, setSelectedPending] = useState<PendingPost | null>(null)

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
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-20">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          {data.client.logoUrl ? (
            <img src={data.client.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Agenda de conteúdo</p>
            <p className="truncate font-display text-base">{data.client.name}</p>
          </div>
          {data.pending.length > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-1 text-xs font-medium text-warning">
              {data.pending.length} aguardando você
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-4">
        {/* Calendar */}
        <CalendarMonth pending={data.pending} scheduled={data.scheduled} past={data.past} />

        {/* Tabs */}
        <div className="mt-6 mb-4 inline-flex rounded-lg border bg-card p-0.5 w-full sm:w-auto">
          {([
            { v: "pendentes", label: "Pendentes", count: data.pending.length },
            { v: "agendados", label: "Agendados", count: data.scheduled.length },
            { v: "publicados", label: "Publicados", count: data.past.length },
            { v: "producoes", label: "Produções", count: data.productions?.length ?? 0 },
          ] as const).map((opt) => (
            <button
              key={opt.v}
              onClick={() => setTab(opt.v)}
              className={cn(
                "flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === opt.v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
              <span className={cn(
                "rounded-full px-1.5 text-[10px]",
                tab === opt.v ? "bg-background" : "bg-muted"
              )}>
                {opt.count}
              </span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "pendentes" && <PendingList pending={data.pending} onOpen={setSelectedPending} />}
        {tab === "agendados" && <ScheduledList scheduled={data.scheduled} />}
        {tab === "publicados" && <PublishedList past={data.past} />}
        {tab === "producoes" && <ProductionsList productions={data.productions ?? []} />}
      </div>

      {/* Approval dialog */}
      {selectedPending && (
        <ApprovalDialog
          post={selectedPending}
          onClose={() => setSelectedPending(null)}
          onDecided={() => { setSelectedPending(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Calendar ────────────────────────────────

function CalendarMonth({
  pending, scheduled, past,
}: {
  pending: PendingPost[]
  scheduled: ScheduledPost[]
  past: PastPost[]
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  type DayItem = { kind: "pending" | "scheduled" | "past"; title: string; time: string; platform: string }
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
      })
    }
    for (const p of scheduled) {
      add(p.scheduledDate, {
        kind: "scheduled",
        title: p.title || "Sem título",
        time: p.scheduledDate ? new Date(p.scheduledDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "",
        platform: p.publishTargets[0]?.platform ?? "instagram",
      })
    }
    for (const p of past) {
      add(p.date, {
        kind: "past",
        title: p.title || "Sem título",
        time: new Date(p.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        platform: p.platforms[0]?.raw.toLowerCase().split(/[\s-]+/)[0] ?? "instagram",
      })
    }
    return map
  }, [pending, scheduled, past])

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
        <h2 className="font-display text-lg capitalize">{monthLabel}</h2>
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
        <div className="grid grid-cols-7 border-b bg-muted/40 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
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
                  "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium",
                  isToday && "bg-primary text-primary-foreground",
                )}>
                  {day.getDate()}
                </div>
                <div className="space-y-0.5">
                  {visible.map((it, i) => (
                    <div
                      key={i}
                      className={cn(
                        "truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                        it.kind === "pending" ? "bg-warning/15 text-warning" :
                          it.kind === "past" ? cn(platformClass(it.platform), "opacity-70") :
                          platformClass(it.platform)
                      )}
                      title={it.title}
                    >
                      <span className="font-mono text-[9px] opacity-70 mr-0.5">{it.time}</span>
                      {it.title}
                    </div>
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

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
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
          <p className="mt-1 text-sm text-muted-foreground">Não há posts aguardando sua aprovação no momento.</p>
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
                {p.publishTargets.length > 3 && <span className="text-[10px] text-muted-foreground">+{p.publishTargets.length - 3}</span>}
              </div>
              <p className="font-medium truncate">{p.title || "Sem título"}</p>
              <p className="text-xs text-muted-foreground truncate">@{p.conta}</p>
              {p.scheduledDate && (
                <p className="mt-1 text-xs text-muted-foreground">
                  <Clock className="inline h-3 w-3 mr-0.5" />
                  {new Date(p.scheduledDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-warning text-warning-foreground px-2 py-1 text-[10px] font-medium">
              Aprovar →
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}

function ScheduledList({ scheduled }: { scheduled: ScheduledPost[] }) {
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
        <div key={p.pageId} className="rounded-lg border bg-card p-3">
          <div className="flex items-start gap-3">
            <PostThumb post={p} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                {p.publishTargets.slice(0, 3).map((t) => (
                  <Badge key={t.raw} className={cn("text-[9px]", platformClass(t.platform))}>{t.raw}</Badge>
                ))}
              </div>
              <p className="font-medium truncate">{p.title || "Sem título"}</p>
              <p className="text-xs text-muted-foreground truncate">@{p.conta}</p>
              {p.scheduledDate && (
                <p className="mt-1 text-xs text-muted-foreground">
                  <Clock className="inline h-3 w-3 mr-0.5" />
                  {new Date(p.scheduledDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PublishedList({ past }: { past: PastPost[] }) {
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
        <div key={p.pageId + p.date} className="rounded-lg border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                {p.platforms.map((pl) => {
                  const platform = pl.raw.toLowerCase().split(/[\s-]+/)[0]
                  return pl.postUrl ? (
                    <a
                      key={pl.raw}
                      href={pl.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium hover:underline", platformClass(platform))}
                    >
                      {pl.raw}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : (
                    <Badge key={pl.raw} className={cn("text-[9px]", platformClass(platform))}>{pl.raw}</Badge>
                  )
                })}
              </div>
              <p className="font-medium truncate">{p.title || "Sem título"}</p>
              <p className="text-xs text-muted-foreground truncate">@{p.conta}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                <Clock className="inline h-3 w-3 mr-0.5" />
                {new Date(p.date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Thumbs ────────────────────────────────

function PostThumb({ post }: { post: SlimPost }) {
  const tipo = post.publishTargets[0]?.tipo.toLowerCase() ?? "feed"
  const isVideo = ["reel", "story", "youtube short", "youtube"].includes(tipo)
  const url = post.thumbnailUrl
    ?? post.feedImageUrls?.[0]
    ?? (isVideo ? null : post.verticalUrls?.[0] ?? null)
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
      {url ? (
        <>
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Play className="h-4 w-4 text-white drop-shadow" fill="white" />
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
        </div>
      )}
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
            <p className="mt-2 text-sm text-muted-foreground">
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
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-xl border bg-background p-4 sm:rounded-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Aprovação</p>
            <h3 className="font-display text-xl truncate">{post.title || "Sem título"}</h3>
            <p className="text-xs text-muted-foreground">@{post.conta}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Per-platform mockups */}
        <div className="grid gap-3 sm:grid-cols-2 mb-4">
          {post.publishTargets.map((t) => (
            <DialogPlatformPreview key={t.raw} target={t} post={post} />
          ))}
        </div>

        {/* Caption */}
        {post.fullCaption && (
          <div className="mb-4 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Legenda</p>
            <p className="whitespace-pre-wrap text-sm">{post.fullCaption}</p>
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
              <label className="text-sm font-medium block mb-2">O que precisa ajustar?</label>
              <textarea
                autoFocus
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ex: trocar a thumb, ajustar a legenda..."
                rows={4}
                className="w-full rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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

function DialogPlatformPreview({ target, post }: { target: TargetCheck; post: SlimPost }) {
  const tipo = target.tipo.toLowerCase()
  const isVideoTarget = tipo === "reel" || tipo === "story" || tipo === "youtube short" || tipo === "youtube"
  const aspect = tipo === "reel" || tipo === "story" || tipo === "youtube short"
    ? "aspect-[9/16]"
    : tipo === "youtube"
      ? "aspect-video"
      : "aspect-square"

  let mediaUrl: string | null = null
  let mediaKind: "image" | "video" = "image"

  if (isVideoTarget) {
    if (post.thumbnailUrl) {
      mediaUrl = post.thumbnailUrl
    } else {
      const url = tipo === "youtube" ? post.horizontalUrls?.[0] : post.verticalUrls?.[0]
      if (url) {
        mediaUrl = url
        mediaKind = "video"
      }
    }
  } else {
    mediaUrl = post.feedImageUrls?.[0] ?? post.thumbnailUrl ?? post.verticalUrls?.[0] ?? null
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="border-b px-3 py-2">
        <Badge className={cn("text-[10px]", platformClass(target.platform))}>{target.raw}</Badge>
      </div>
      <div className={cn("relative bg-muted", aspect)}>
        {mediaKind === "image" && mediaUrl && (
          <img src={mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {mediaKind === "video" && mediaUrl && (
          <video src={mediaUrl} className="absolute inset-0 h-full w-full object-cover" muted playsInline preload="metadata" />
        )}
        {mediaUrl && isVideoTarget && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-full bg-black/50 p-3">
              <Play className="h-6 w-6 text-white" fill="white" />
            </div>
          </div>
        )}
        {!mediaUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <AlertTriangle className="h-6 w-6 mb-1" />
            <span className="text-xs">Sem mídia</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ProductionsList({ productions }: { productions: ProductionItem[] }) {
  if (productions.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma produção em andamento. Quando a agência criar um vídeo ou podcast, aparece aqui.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Group by status family for a cleaner read.
  const groups: Array<{ key: string; label: string; statuses: string[] }> = [
    { key: "awaiting", label: "Aguardando você", statuses: ["awaiting_approval", "brief_pending"] },
    { key: "revision", label: "Em revisão", statuses: ["revision_requested"] },
    { key: "production", label: "Em produção", statuses: ["script_drafting", "approved", "recording", "editing", "delivered"] },
    { key: "done", label: "Publicados", statuses: ["published"] },
  ]

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const items = productions.filter((p) => group.statuses.includes(p.status))
        if (items.length === 0) return null
        return (
          <div key={group.key}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label} ({items.length})
            </p>
            <div className="space-y-2">
              {items.map((p) => (
                <Card key={p.id} className="overflow-hidden">
                  <CardContent className="flex items-start gap-3 py-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Play className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {p.statusLabel}
                        {p.specialistName ? ` · ${p.specialistName}` : ""}
                        {p.recordingDate ? ` · grava ${shortDate(p.recordingDate)}` : ""}
                      </p>
                      {p.topic && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.topic}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {p.pendingApprovalToken && (
                        <Button size="sm" asChild>
                          <a href={`/approve/${p.pendingApprovalToken}`}>
                            Revisar
                          </a>
                        </Button>
                      )}
                      {p.finalVideoUrl && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={p.finalVideoUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Vídeo
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
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
