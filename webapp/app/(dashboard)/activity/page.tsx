"use client"
/**
 * Cross-client activity feed — single chronological stream of what
 * happened across all accessible clients in the last 14 days. Useful
 * for catching up after a few days away or sharing a recap with team.
 *
 * Events surfaced:
 *   - Posts publicados (com link para o permalink)
 *   - Posts que falharam (com mensagem de erro)
 *   - Aprovações decididas (aprovado / pediu alterações / expirou)
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Activity as ActivityIcon,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageCircle,
  ThumbsUp,
  XCircle,
  Clock,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Event =
  | {
      kind: "published" | "failed"
      id: string
      timestamp: string
      clientId: string | null
      clientName: string | null
      postTitle: string
      conta: string | null
      platform: string | null
      error: string | null
      permalink: string | null
    }
  | {
      kind: "approval_decided"
      id: string
      timestamp: string
      clientId: string | null
      clientName: string | null
      postTitle: string
      contactName: string | null
      decision: "approved" | "changes_requested" | "expired" | string
      comment: string | null
      token: string
    }

type Days = 7 | 14 | 30
type KindFilter = "all" | "publishes" | "approvals"

export default function ActivityPage() {
  const [events, setEvents] = useState<Event[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState<Days>(14)
  const [kindFilter, setKindFilter] = useState<KindFilter>("all")

  async function load(d: Days = days, k: KindFilter = kindFilter) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: "80", days: String(d) })
      if (k !== "all") params.set("kinds", k)
      const res = await fetch(`/api/activity?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Erro ao carregar")
      setEvents(Array.isArray(data.events) ? data.events : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function changeDays(d: Days) {
    setDays(d)
    load(d, kindFilter)
  }

  function changeKind(k: KindFilter) {
    setKindFilter(k)
    load(days, k)
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl tracking-tight sm:text-4xl">Atividade</h1>
          <p className="text-muted-foreground">
            Tudo que rolou — posts publicados, falhas e decisões dos clientes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Período</span>
        {([7, 14, 30] as const).map((d) => (
          <button
            key={d}
            onClick={() => changeDays(d)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              days === d
                ? "border-primary bg-primary/10 text-primary"
                : "border-muted bg-muted/30 text-muted-foreground hover:bg-muted/50",
            )}
          >
            {d}d
          </button>
        ))}
        <span className="ml-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">Tipo</span>
        {([
          { key: "all" as const, label: "Tudo" },
          { key: "publishes" as const, label: "Publicações" },
          { key: "approvals" as const, label: "Aprovações" },
        ]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => changeKind(opt.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              kindFilter === opt.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-muted bg-muted/30 text-muted-foreground hover:bg-muted/50",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive">
          {error}
        </div>
      )}

      {loading && events === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !events || events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ActivityIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="font-medium">Nada por aqui</p>
            <p className="mt-1 text-base text-muted-foreground">
              Sem eventos nos últimos {days} dias{kindFilter !== "all" ? ` (filtro: ${kindFilter === "publishes" ? "publicações" : "aprovações"})` : ""}.
              {kindFilter !== "all" && " Tenta outro filtro."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </div>
  )
}

function EventRow({ event }: { event: Event }) {
  const ago = timeAgo(event.timestamp)

  if (event.kind === "approval_decided") {
    const decision = event.decision
    const tone =
      decision === "approved" ? "border-success/30 bg-success/5"
        : decision === "changes_requested" ? "border-warning/30 bg-warning/5"
          : "border-muted-foreground/20 bg-muted/30"
    const icon =
      decision === "approved" ? <ThumbsUp className="h-4 w-4 text-success" />
        : decision === "changes_requested" ? <MessageCircle className="h-4 w-4 text-warning" />
          : <Clock className="h-4 w-4 text-muted-foreground" />
    const verb =
      decision === "approved" ? "aprovou"
        : decision === "changes_requested" ? "pediu alterações em"
          : "deixou expirar"
    const who = event.contactName || "Cliente"
    return (
      <li className={cn("rounded-lg border p-3", tone)}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-base">
              <strong>{who}</strong> {verb} <strong>{event.postTitle || "post sem título"}</strong>
              {event.clientName && (
                <span className="text-muted-foreground"> · {event.clientName}</span>
              )}
            </p>
            {event.comment && (
              <p className="mt-1 break-words text-[13px] italic text-muted-foreground">
                &quot;{event.comment}&quot;
              </p>
            )}
            <p className="mt-1 text-[13px] text-muted-foreground">{ago}</p>
          </div>
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <Link href={`/approve/${event.token}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Ver
            </Link>
          </Button>
        </div>
      </li>
    )
  }

  // publish event
  const failed = event.kind === "failed"
  const tone = failed ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5"
  return (
    <li className={cn("rounded-lg border p-3", tone)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {failed ? <XCircle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base">
            {failed ? "Falhou: " : "Publicado: "}
            <strong>{event.postTitle || "post sem título"}</strong>
            {event.conta && <span className="text-muted-foreground"> · @{event.conta}</span>}
            {event.platform && <span className="text-muted-foreground"> · {event.platform}</span>}
            {event.clientName && <span className="text-muted-foreground"> · {event.clientName}</span>}
          </p>
          {failed && event.error && (
            <p className="mt-1 break-words text-[13px] text-destructive">{event.error}</p>
          )}
          <p className="mt-1 text-[13px] text-muted-foreground">{ago}</p>
        </div>
        {!failed && event.permalink && (
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <a href={event.permalink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Ver
            </a>
          </Button>
        )}
        {failed && (
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link href="/scheduled?filter=errors">
              <AlertTriangle className="h-3.5 w-3.5" />
              Resolver
            </Link>
          </Button>
        )}
      </div>
    </li>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "agora"
  if (mins < 60) return `há ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `há ${days}d`
  return new Date(iso).toLocaleDateString("pt-BR")
}
