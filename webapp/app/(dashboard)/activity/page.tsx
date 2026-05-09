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

export default function ActivityPage() {
  const [events, setEvents] = useState<Event[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/activity?limit=80")
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
  }, [])

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Atividade</h1>
          <p className="text-muted-foreground">
            Tudo que rolou nos últimos 14 dias — posts publicados, falhas e decisões dos clientes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
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
            <p className="mt-1 text-sm text-muted-foreground">
              Sem eventos nos últimos 14 dias. Volta depois que o cron tiver rodado ou alguém aprovar um post.
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
            <p className="text-sm">
              <strong>{who}</strong> {verb} <strong>{event.postTitle || "post sem título"}</strong>
              {event.clientName && (
                <span className="text-muted-foreground"> · {event.clientName}</span>
              )}
            </p>
            {event.comment && (
              <p className="mt-1 break-words text-[11px] italic text-muted-foreground">
                &quot;{event.comment}&quot;
              </p>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">{ago}</p>
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
          <p className="text-sm">
            {failed ? "Falhou: " : "Publicado: "}
            <strong>{event.postTitle || "post sem título"}</strong>
            {event.conta && <span className="text-muted-foreground"> · @{event.conta}</span>}
            {event.platform && <span className="text-muted-foreground"> · {event.platform}</span>}
            {event.clientName && <span className="text-muted-foreground"> · {event.clientName}</span>}
          </p>
          {failed && event.error && (
            <p className="mt-1 break-words text-[11px] text-destructive">{event.error}</p>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">{ago}</p>
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
