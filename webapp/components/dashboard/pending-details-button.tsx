"use client"

import { useState } from "react"
import { Loader2, Eye, X, ExternalLink } from "lucide-react"
import { toast } from "sonner"

type PendingRow = {
  id: string
  token: string
  notionPageId: string | null
  postTitle: string | null
  conta: string | null
  contactName: string | null
  contactPhone: string | null
  sentVia: string | null
  sentAt: string | null
  lastError: string | null
  connectionId: string | null
  createdAt: string
  expiresAt: string
  notionUrl: string | null
  stillAwaiting: boolean
}

// Inspect every pending approvalLink for the client. Used to figure
// out why the dashboard count doesn't match what the user sees in
// Notion (e.g. 10 pending but only 1 actually awaiting). Lists each
// row with its title, contact, sentVia, lastError, and the critical
// stillAwaiting flag.
export function PendingDetailsButton({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/pending-debug`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function openDialog() {
    setOpen(true)
    if (!data) load()
  }

  if (!open) {
    return (
      <button
        onClick={openDialog}
        title="Ver detalhes de cada pendência (título, contato, status)"
        className="inline-flex h-5 items-center gap-1 rounded-md border border-muted px-1.5 text-[12px] font-medium text-muted-foreground hover:bg-accent"
      >
        <Eye className="h-2.5 w-2.5" />
        Detalhes
      </button>
    )
  }

  const pending: PendingRow[] = data?.pending ?? []

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setOpen(false)} />
      <div className="fixed inset-x-4 top-10 z-50 mx-auto max-h-[80vh] max-w-3xl overflow-auto rounded-lg border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-base font-semibold">Detalhes das pendências</p>
            {data && (
              <p className="text-sm text-muted-foreground">
                {data.totalPending} link(s) pendente(s) no banco · {data.totalAwaitingAcrossConnections} post(s) realmente aguardando no Notion
                {data.shouldBeExpiredCount > 0 && (
                  <> · <span className="text-warning">{data.shouldBeExpiredCount} deveria(m) estar expirado(s)</span></>
                )}
                {data.liveSentNotInAwaitingCount > 0 && (
                  <> · {data.liveSentNotInAwaitingCount} já enviado(s) (link WhatsApp ainda válido)</>
                )}
              </p>
            )}
          </div>
          <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : pending.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">Sem pendentes.</p>
          ) : (
            <div className="space-y-4">
              {(() => {
                // Group pending rows by conta so the user (inside one
                // client view) sees per-brand sections instead of a
                // flat list. Posts without conta land in "(sem conta)".
                const byConta = new Map<string, PendingRow[]>()
                for (const p of pending) {
                  const key = p.conta?.trim() || "(sem conta)"
                  const arr = byConta.get(key) ?? []
                  arr.push(p)
                  byConta.set(key, arr)
                }
                const groups = Array.from(byConta.entries()).sort(([a], [b]) => a.localeCompare(b))
                return groups.map(([conta, rows]) => (
                  <section key={conta} className="space-y-2">
                    <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {conta} <span className="font-mono text-muted-foreground/70">({rows.length})</span>
                    </h3>
                    <ul className="space-y-2">
                      {rows.map((p) => (
                        <li
                          key={p.id}
                          className={
                            "rounded-md border p-3 text-sm " +
                            (p.stillAwaiting
                              ? "border-success/40 bg-success/5"
                              : p.sentVia === "manychat"
                              ? "border-muted bg-muted/30"
                              : "border-warning/40 bg-warning/10")
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{p.postTitle ?? "(sem título)"}</p>
                              <p className="mt-0.5 text-[13px] text-muted-foreground">
                                {p.contactName ?? "(sem contato)"}{p.contactPhone ? ` · ${p.contactPhone}` : ""}
                              </p>
                              <p className="mt-1 text-[12px]">
                                <span className="font-mono">{p.sentVia ?? "none"}</span>
                                {p.stillAwaiting ? (
                                  <span className="ml-2 text-success">✓ ainda awaiting</span>
                                ) : p.sentVia === "manychat" ? (
                                  <span className="ml-2 text-muted-foreground">já enviado · link WA válido</span>
                                ) : (
                                  <span className="ml-2 text-warning">⚠ post NÃO está awaiting no Notion (órfão)</span>
                                )}
                              </p>
                              {p.lastError && (
                                <p className="mt-1 text-[12px] text-destructive break-all">{p.lastError}</p>
                              )}
                              {!p.connectionId && (
                                <p className="mt-1 text-[12px] text-muted-foreground">connectionId: null (legacy row)</p>
                              )}
                            </div>
                            {p.notionUrl && (
                              <a
                                href={p.notionUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex shrink-0 items-center gap-1 text-[13px] text-primary hover:underline"
                              >
                                Notion <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              })()}
            </div>
          )}

          {data?.awaitingByConnection?.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                {data.awaitingByConnection.length} conexão(ões) Notion deste cliente
              </summary>
              <ul className="mt-2 space-y-1 text-[13px]">
                {data.awaitingByConnection.map((c: any) => (
                  <li key={c.connectionId} className="rounded bg-muted/30 p-2">
                    <p className="font-mono text-[12px]">{c.connectionId}</p>
                    <p>
                      {c.pageIds.length} post(s) awaiting
                      {c.error && <span className="ml-2 text-destructive">⚠ {c.error}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </>
  )
}
