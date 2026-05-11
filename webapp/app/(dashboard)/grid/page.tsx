"use client"
/**
 * Instagram grid preview — shows how the agency's IG feed will LOOK
 * after the next batch of scheduled posts publishes. Combines:
 *   - Already-published media (from IG Graph API, last 12)
 *   - Upcoming scheduled posts (from Notion via /api/notion/scheduled
 *     subset filtered by IG-feed-eligible targets)
 *
 * Sorted newest-first (matching IG's natural feed order). Future posts
 * are visually distinct (dotted border + "Agendado" badge + time-until).
 *
 * Picker at top: client (if agency mode) → conta. Persists last
 * selection in localStorage so reopening lands on the same view.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Grid3x3, ExternalLink, Calendar as CalendarIcon, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type IgAccount = {
  id: string
  conta: string
  pageName: string
  platform: string
  active: boolean
  clientId: string | null
}

type GridPublished = {
  kind: "published"
  id: string
  thumbnailUrl: string
  permalink: string
  timestamp: string
  caption: string | null
  mediaType: string
}

type GridUpcoming = {
  kind: "upcoming"
  pageId: string
  connectionId: string
  title: string
  thumbnailUrl: string | null
  caption: string
  scheduledDate: string | null
  tipo: string
  notionUrl: string
}

type GridItem = GridPublished | GridUpcoming

type Client = { id: string; name: string }

export default function GridPreviewPage() {
  const [accounts, setAccounts] = useState<IgAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedConta, setSelectedConta] = useState<string>("")
  const [selectedClientId, setSelectedClientId] = useState<string>("")
  const [items, setItems] = useState<GridItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the user's clients + accounts on mount.
  useEffect(() => {
    async function load() {
      setAccountsLoading(true)
      try {
        const [accRes, clientsRes] = await Promise.all([
          fetch("/api/accounts"),
          fetch("/api/clients"),
        ])
        const accData = await accRes.json()
        const clientsData = await clientsRes.json()
        const list: IgAccount[] = Array.isArray(accData) ? accData : []
        // IG only — the grid is IG-specific. Filter to active rows.
        const igOnly = list.filter((a) => a.platform === "instagram" && a.active)
        setAccounts(igOnly)
        const cs: Client[] = Array.isArray(clientsData?.clients) ? clientsData.clients : []
        setClients(cs)

        // Pick a sensible default: try localStorage first, else first IG conta.
        const savedConta = typeof window !== "undefined" ? localStorage.getItem("vp_grid_conta") : null
        const initialConta = savedConta && igOnly.some((a) => a.conta === savedConta) ? savedConta : igOnly[0]?.conta ?? ""
        const initialAcct = igOnly.find((a) => a.conta === initialConta)
        setSelectedConta(initialConta)
        setSelectedClientId(initialAcct?.clientId ?? "")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar contas")
      } finally {
        setAccountsLoading(false)
      }
    }
    load()
  }, [])

  // Reload grid whenever conta/client changes.
  useEffect(() => {
    if (!selectedConta || !selectedClientId) {
      setItems(null)
      return
    }
    async function loadGrid() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/grid-preview?clientId=${encodeURIComponent(selectedClientId)}&conta=${encodeURIComponent(selectedConta)}`,
        )
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Erro ao carregar grid")
        // Combine + sort: upcoming first (newest-scheduled at top), then published.
        const combined: GridItem[] = [
          ...(data.upcoming ?? []),
          ...(data.published ?? []),
        ]
        setItems(combined)
        // Persist for next visit
        try {
          localStorage.setItem("vp_grid_conta", selectedConta)
        } catch {}
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar grid")
        setItems(null)
      } finally {
        setLoading(false)
      }
    }
    loadGrid()
  }, [selectedConta, selectedClientId])

  function pickAccount(conta: string) {
    const acct = accounts.find((a) => a.conta === conta)
    setSelectedConta(conta)
    setSelectedClientId(acct?.clientId ?? "")
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl tracking-tight sm:text-4xl">Preview do grid</h1>
          <p className="text-muted-foreground">
            Veja como o feed do Instagram vai ficar depois que os posts agendados publicarem.
          </p>
        </div>
      </div>

      {/* Account picker */}
      {accountsLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Grid3x3 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="font-medium">Nenhuma conta Instagram conectada</p>
            <p className="mt-1 text-base text-muted-foreground">
              Vá em <Link href="/accounts" className="underline">Contas</Link> e conecte uma página do Facebook + IG.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => {
                  const client = clients.find((c) => c.id === a.clientId)
                  const active = a.conta === selectedConta
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => pickAccount(a.conta)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-base transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:bg-accent",
                      )}
                    >
                      <span className="font-medium">@{a.conta}</span>
                      {client?.name && (
                        <span className="ml-1.5 text-[13px] text-muted-foreground">· {client.name}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items === null ? null : items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-base text-muted-foreground">
                  Sem posts pra mostrar. Agende um post no Notion ou aguarde os já agendados aparecerem.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-success" />
                  Publicado
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                  Agendado
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-lg border bg-muted/20 p-1">
                {items.map((it, idx) => (
                  <GridTile key={`${it.kind}:${"id" in it ? it.id : it.pageId}:${idx}`} item={it} />
                ))}
              </div>

              <p className="mt-3 text-[13px] text-muted-foreground">
                Posts à esquerda/topo são os mais novos (mesma ordem do feed real do Instagram). Borda contínua = publicado; borda tracejada = agendado.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}

function GridTile({ item }: { item: GridItem }) {
  const isUpcoming = item.kind === "upcoming"
  const thumb = item.kind === "published" ? item.thumbnailUrl : item.thumbnailUrl
  const dateStr = item.kind === "published" ? item.timestamp : item.scheduledDate

  return (
    <a
      href={item.kind === "published" ? item.permalink : item.notionUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group relative aspect-square overflow-hidden bg-muted",
        isUpcoming
          ? "outline outline-2 outline-dashed outline-offset-[-4px] outline-primary"
          : "outline outline-1 outline-offset-[-1px] outline-success/30",
      )}
      title={item.kind === "published" ? (item.caption ?? "") : item.title}
    >
      {thumb ? (
        // Using a regular img tag — IG returns expiring presigned URLs
        // that don't play nice with next/image's optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          className={cn(
            "h-full w-full object-cover transition-opacity",
            isUpcoming && "opacity-90",
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/40 text-sm text-muted-foreground">
          Sem mídia
        </div>
      )}

      {/* Status badge */}
      <div className="absolute left-1.5 top-1.5">
        {isUpcoming ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/90 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary-foreground shadow-sm backdrop-blur-sm">
            <Clock className="h-2.5 w-2.5" />
            Agendado
          </span>
        ) : (
          <span className="rounded-full bg-success/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-success-foreground shadow-sm backdrop-blur-sm">
            ✓
          </span>
        )}
      </div>

      {/* Date overlay on hover */}
      {dateStr && (
        <div className="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-2 py-1 text-[12px] text-white transition-transform group-hover:translate-y-0">
          <CalendarIcon className="mr-1 inline h-2.5 w-2.5" />
          {new Date(dateStr).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </div>
      )}

      {/* External-link icon */}
      <div className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
        <ExternalLink className="h-3 w-3 text-white" />
      </div>
    </a>
  )
}
