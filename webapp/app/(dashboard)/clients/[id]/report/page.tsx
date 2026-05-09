"use client"
/**
 * Per-client monthly report — printable summary the agency can share
 * with the end client. Shows publish counts per platform, total
 * engagement, top 3 posts, approval flow stats, all scoped to the
 * selected month.
 *
 * Print-friendly: agency can hit Cmd/Ctrl+P → Save as PDF and send to
 * client. Header includes the client's logo + month label.
 */

import { useEffect, useState, useMemo } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  Printer,
  RefreshCw,
  ThumbsUp,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"

type ReportData = {
  client: { id: string; name: string; logoUrl: string | null }
  month: { label: string; from: string; to: string }
  publish: {
    totalPublished: number
    totalFailed: number
    totalSkipped: number
    byPlatform: Array<{ platform: string; published: number; failed: number; skipped: number }>
  }
  engagement: {
    totalLikes: number
    totalComments: number
    totalReach: number
    totalSaves: number
    totalImpressions: number
    coveragePercent: number
    analyticsCovered: number
  }
  approval: {
    total: number
    approved: number
    revisionRequested: number
    expired: number
    pending: number
    firstTryRate: number | null
    avgDecisionHours: number | null
  }
  topPosts: Array<{
    pageId: string
    title: string
    conta: string
    platform: string
    publishedAt: string
    likes: number
    comments: number
    reach: number
    impressions: number
    permalink: string | null
  }>
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default function ReportPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const clientId = params?.id
  const monthParam = searchParams.get("month")

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  // Default to current month, parse from URL if present.
  const cursor = useMemo(() => {
    const m = (monthParam ?? "").match(/^(\d{4})-(\d{2})$/)
    if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1)
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  }, [monthParam])

  useEffect(() => {
    if (!clientId) return
    setLoading(true)
    setError(null)
    fetch(`/api/clients/${clientId}/report?month=${ymd(cursor)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error ?? "Erro ao carregar relatório")
        return body as ReportData
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [clientId, cursor])

  function shiftMonth(delta: number) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1)
    router.replace(`/clients/${clientId}/report?month=${ymd(next)}`)
  }

  async function syncNow() {
    if (!clientId) return
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/sync-analytics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: ymd(cursor) }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "Erro ao sincronizar")
      const n = body?.triggered ?? 0
      setSyncMessage(
        n === 0
          ? "Nenhum post publicado neste mês para sincronizar."
          : `Sincronização iniciada para ${n} post${n === 1 ? "" : "s"}. Recarrega em 1-2 minutos pra ver os números atualizados.`,
      )
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{error ?? "Erro ao carregar"}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      {/* Print-only style: hide the navigation chrome when printing */}
      <style jsx global>{`
        @media print {
          aside, .print\\:hidden { display: none !important; }
          main, body { background: white !important; }
        }
      `}</style>

      {/* Header — visible on screen + on print */}
      <header className="mb-8 flex flex-col gap-3 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {data.client.logoUrl ? (
            <img src={data.client.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-6 w-6" />
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Relatório mensal</p>
            <h1 className="font-display text-2xl">{data.client.name}</h1>
            <p className="text-sm text-muted-foreground capitalize">{data.month.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 print:hidden">
          <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing} title="Buscar números atualizados do Instagram">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/clients/${clientId}/report/csv?month=${ymd(cursor)}`} download>
              <Download className="h-4 w-4" />
              Baixar CSV
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir / PDF
          </Button>
        </div>
      </header>

      {syncMessage && (
        <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm print:hidden">
          {syncMessage}
        </div>
      )}

      {/* Hero numbers */}
      <section className="mb-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Publicados" value={data.publish.totalPublished} tone="success" />
          <Stat label="Falhas" value={data.publish.totalFailed} tone={data.publish.totalFailed > 0 ? "destructive" : "muted"} />
          <Stat label="Aprovações" value={data.approval.total} tone="muted" />
          <Stat
            label="Aprovado de 1ª"
            value={data.approval.firstTryRate !== null ? `${data.approval.firstTryRate}%` : "—"}
            tone="muted"
          />
        </div>
      </section>

      {/* Engagement */}
      {data.engagement.analyticsCovered > 0 ? (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Engajamento</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Curtidas" value={fmt(data.engagement.totalLikes)} icon={<Heart className="h-3.5 w-3.5" />} />
            <Stat label="Comentários" value={fmt(data.engagement.totalComments)} icon={<MessageCircle className="h-3.5 w-3.5" />} />
            <Stat label="Alcance" value={fmt(data.engagement.totalReach)} />
            <Stat label="Salvamentos" value={fmt(data.engagement.totalSaves)} />
            <Stat label="Impressões" value={fmt(data.engagement.totalImpressions)} />
          </div>
          {data.engagement.coveragePercent < 100 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {data.engagement.coveragePercent}% dos posts têm analytics sincronizadas. Os dados podem subir após o próximo sync.
            </p>
          )}
        </section>
      ) : (
        <section className="mb-8">
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Engajamento ainda não sincronizado pra este mês. As métricas aparecerão depois do próximo sync de analytics.
            </CardContent>
          </Card>
        </section>
      )}

      {/* Per-platform breakdown */}
      {data.publish.byPlatform.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Por plataforma
          </h2>
          <Card>
            <CardContent className="py-3">
              <ul className="divide-y">
                {data.publish.byPlatform.map((p) => (
                  <li key={p.platform} className="flex items-center justify-between py-2">
                    <span className="font-medium">{p.platform}</span>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-success">{p.published} publicados</span>
                      {p.failed > 0 && <span className="text-destructive">{p.failed} falha(s)</span>}
                      {p.skipped > 0 && <span className="text-muted-foreground">{p.skipped} pulados</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Top 3 posts */}
      {data.topPosts.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Top {data.topPosts.length} posts
            </h2>
          </div>
          <ul className="space-y-2">
            {data.topPosts.map((p, idx) => (
              <li key={p.pageId + p.platform} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title || "Sem título"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    @{p.conta} · {p.platform} · {new Date(p.publishedAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3 w-3" />
                    {fmt(p.likes)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    {fmt(p.comments)}
                  </span>
                  <span className="text-muted-foreground">{fmt(p.reach)} alcance</span>
                  {p.permalink && (
                    <a
                      href={p.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground print:hidden"
                      title="Abrir post"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Approval breakdown */}
      {data.approval.total > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Fluxo de aprovação</h2>
          </div>
          <Card>
            <CardContent className="grid gap-3 py-4 sm:grid-cols-4">
              <Stat label="Aprovados" value={data.approval.approved} tone="success" />
              <Stat label="Pediram alterações" value={data.approval.revisionRequested} tone={data.approval.revisionRequested > 0 ? "warning" : "muted"} />
              <Stat label="Expiraram" value={data.approval.expired} tone={data.approval.expired > 0 ? "destructive" : "muted"} />
              <Stat
                label="Tempo médio até decisão"
                value={data.approval.avgDecisionHours !== null ? `${data.approval.avgDecisionHours}h` : "—"}
                tone="muted"
              />
            </CardContent>
          </Card>
        </section>
      )}

      <footer className="mt-12 border-t pt-4 text-[11px] text-muted-foreground">
        <p>Relatório gerado por <strong>VP Social</strong> · {new Date().toLocaleDateString("pt-BR")}</p>
      </footer>
    </div>
  )
}

type Tone = "success" | "destructive" | "warning" | "muted"
const TONE_CLASS: Record<Tone, string> = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
  muted: "",
}

function Stat({
  label,
  value,
  tone = "muted",
  icon,
}: {
  label: string
  value: string | number
  tone?: Tone
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={cn("mt-1 font-display text-2xl leading-none", TONE_CLASS[tone])}>{value}</p>
    </div>
  )
}

function fmt(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`.replace(".0k", "k")
  return `${Math.round(n / 1000)}k`
}
