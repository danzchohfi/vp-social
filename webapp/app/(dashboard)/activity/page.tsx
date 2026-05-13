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
import { PostRowSkeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import {
  Activity as ActivityIcon,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Facebook,
  Instagram,
  Linkedin,
  Loader2,
  MessageCircle,
  ThumbsUp,
  XCircle,
  Clock,
  RefreshCw,
  Youtube,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Tiny inline icon for the platform a post was published to. Replaces
// the previous `· {event.platform}` text rendering ("Instagram Story 2/2"
// + "@ComparaCar" + "comparaCAR" = redundant chain). Just the icon now,
// with the post format (Story, Reel, Feed) kept as a tiny lowercase
// suffix when meaningful — drops the platform name itself since the
// icon already tells you. TikTok ships its own SVG (lucide doesn't).
const PLATFORM_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  linkedin: Linkedin,
}

function TikTokGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
    </svg>
  )
}

function PlatformChip({ raw }: { raw: string | null }) {
  if (!raw || raw === "—") return null
  // event.platform comes as "Instagram Story 2/2" / "Instagram Feed" /
  // "Instagram Reel" / "Facebook Feed" / "YouTube Short" / etc. First
  // word identifies the platform; the rest is the post format we want
  // to keep (compact, lowercase-friendly).
  const [first, ...rest] = raw.split(/\s+/)
  const key = first.toLowerCase()
  const Icon = key === "tiktok" ? TikTokGlyph : (PLATFORM_ICON[key] ?? null)
  const tipo = rest.join(" ").trim()
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-1.5 py-0.5 text-[12px] text-muted-foreground"
      title={raw}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {tipo && <span>{tipo}</span>}
    </span>
  )
}

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
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <PageHeader
        title="Atividade"
        subtitle="Tudo que rolou — posts publicados, falhas e decisões dos clientes."
        action={
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar
          </Button>
        }
      />

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
        <PostRowSkeleton count={5} />
      ) : !events || events.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title="Nada por aqui"
          description={`Sem eventos nos últimos ${days} dias${kindFilter !== "all" ? ` (filtro: ${kindFilter === "publishes" ? "publicações" : "aprovações"})` : ""}.${kindFilter !== "all" ? " Tenta outro filtro." : ""}`}
          tone="neutral"
        />
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
          </p>
          {/* Meta row: platform icon + format chip + (conta only when
              it differs from clientName, to avoid the
              `@ComparaCar · ... · comparaCAR` repetition). Compact + on
              its own line so the title stays clean. */}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
            <PlatformChip raw={event.platform} />
            {event.conta && (!event.clientName || event.conta.toLowerCase() !== event.clientName.toLowerCase()) && (
              <span>@{event.conta}</span>
            )}
            {event.clientName && <span>· {event.clientName}</span>}
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
