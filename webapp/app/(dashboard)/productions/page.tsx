"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Loader2, Plus, RefreshCw, Film } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusPill } from "@/components/productions/status-pill"
import { PRODUCTION_STATUSES, type ProductionStatus } from "@/lib/productions"

type ProductionRow = {
  id: string
  title: string
  type: string
  status: ProductionStatus
  statusLabel: string
  specialistName: string | null
  recordingDate: string | null
  deliveryDate: string | null
  publishDate: string | null
  updatedAt: string
}

type Filter = "all" | "drafting" | "approval" | "production" | "done"

const FILTERS: Array<{ value: Filter; label: string; statuses: ProductionStatus[] }> = [
  { value: "all", label: "Tudo", statuses: [...PRODUCTION_STATUSES] },
  { value: "drafting", label: "Em elaboração", statuses: ["brief_pending", "script_drafting", "revision_requested"] },
  { value: "approval", label: "Aguardando aprovação", statuses: ["awaiting_approval"] },
  { value: "production", label: "Em produção", statuses: ["approved", "recording", "editing", "delivered"] },
  { value: "done", label: "Publicados", statuses: ["published", "archived"] },
]

export default function ProductionsListPage() {
  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [agencyMode, setAgencyMode] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/productions")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setProductions(data.productions ?? [])
      setAgencyMode(!!data.agencyMode)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const visible = useMemo(() => {
    const allowed = new Set(FILTERS.find((f) => f.value === filter)!.statuses)
    return productions.filter((p) => allowed.has(p.status))
  }, [productions, filter])

  const counts = useMemo(() => {
    const by = new Map<Filter, number>()
    for (const f of FILTERS) {
      by.set(f.value, productions.filter((p) => f.statuses.includes(p.status)).length)
    }
    return by
  }, [productions])

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title={
          <span className="flex flex-wrap items-baseline gap-2">
            Produções
            {agencyMode && (
              <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-sm font-medium text-primary">
                Visão agência · todos os clientes
              </span>
            )}
          </span>
        }
        subtitle="Vídeos e podcasts no fluxo de roteiro → aprovação → entrega."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button asChild size="sm">
              <Link href="/productions/new">
                <Plus className="h-4 w-4" />
                Nova produção
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 inline-flex flex-wrap gap-1 rounded-lg border bg-card p-0.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors",
              filter === f.value
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[12px]",
                filter === f.value ? "bg-background" : "bg-muted",
              )}
            >
              {counts.get(f.value) ?? 0}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-base text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Film className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">
              {productions.length === 0
                ? "Nenhuma produção ainda"
                : "Nenhuma produção neste filtro"}
            </p>
            <p className="mt-1 text-base text-muted-foreground">
              {productions.length === 0
                ? "Crie a primeira pra começar o fluxo de roteiro → aprovação → entrega."
                : "Mude de filtro ou atualize a página."}
            </p>
            {productions.length === 0 && (
              <Button asChild size="sm" className="mt-4">
                <Link href="/productions/new">
                  <Plus className="h-4 w-4" />
                  Nova produção
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => (
            <Link
              key={p.id}
              href={`/productions/${p.id}`}
              className="block rounded-lg border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-accent/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{p.title || "Sem título"}</p>
                    <span className="text-[13px] uppercase tracking-wider text-muted-foreground">
                      {p.type}
                    </span>
                    <StatusPill status={p.status} />
                  </div>
                  {p.specialistName && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Especialista: {p.specialistName}
                    </p>
                  )}
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  {p.recordingDate && (
                    <p>Gravação: {formatShort(p.recordingDate)}</p>
                  )}
                  {p.deliveryDate && <p>Entrega: {formatShort(p.deliveryDate)}</p>}
                  <p className="mt-1 opacity-70">
                    Atualizado {timeAgo(p.updatedAt)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function formatShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "agora"
  if (mins < 60) return `há ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}
