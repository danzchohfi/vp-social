"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChevronLeft, Loader2, Save, Trash2, Send } from "lucide-react"
import { toast } from "sonner"
import { ScriptEditor } from "@/components/productions/script-editor"
import { StatusPill } from "@/components/productions/status-pill"
import { StatusTimeline } from "@/components/productions/status-timeline"
import {
  ApproverChainEditor,
  type ApproverOption,
} from "@/components/productions/approver-chain-editor"
import { CommentThread } from "@/components/productions/comment-thread"
import {
  PRODUCTION_STATUSES,
  STATUS_LABEL_PT,
  type ProductionStatus,
} from "@/lib/productions"

type Production = {
  id: string
  title: string
  type: string
  status: ProductionStatus
  statusLabel: string
  specialistName: string | null
  specialistContactName?: string | null
  specialistContactEmail?: string | null
  specialistContactPhone?: string | null
  topic: string | null
  briefJson: string | null
  scriptJson: string | null
  recordingDate: string | null
  deliveryDate: string | null
  publishDate: string | null
  finalVideoUrl: string | null
  notionPageId: string | null
  clientId: string
  updatedAt: string
}

type Chain = Array<{ stepOrder: number; approver: ApproverOption }>

export default function ProductionDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [production, setProduction] = useState<Production | null>(null)
  const [chain, setChain] = useState<Chain>([])
  const [approvers, setApprovers] = useState<ApproverOption[]>([])

  const [briefJson, setBriefJson] = useState<unknown>(null)
  const [scriptJson, setScriptJson] = useState<unknown>(null)
  const [savingBrief, setSavingBrief] = useState(false)
  const [savingScript, setSavingScript] = useState(false)
  const briefTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scriptTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [prodRes, approversRes] = await Promise.all([
        fetch(`/api/productions/${id}`),
        fetch("/api/approvers"),
      ])
      const prodData = await prodRes.json()
      if (!prodRes.ok) throw new Error(prodData.error ?? "Erro ao carregar produção")
      const approversData = await approversRes.json()
      if (!approversRes.ok) throw new Error(approversData.error ?? "Erro ao carregar aprovadores")
      setProduction(prodData.production)
      setChain(prodData.chain)
      setApprovers(approversData.approvers)
      setBriefJson(prodData.production.briefJson ? JSON.parse(prodData.production.briefJson) : null)
      setScriptJson(prodData.production.scriptJson ? JSON.parse(prodData.production.scriptJson) : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/productions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Falha ao atualizar")
    return data
  }

  // Debounced auto-save for brief / script TipTap content. 1.5s after the
  // user stops typing, send a PATCH. Toast only on error to avoid noise.
  function scheduleBriefSave(json: unknown) {
    setBriefJson(json)
    if (briefTimer.current) clearTimeout(briefTimer.current)
    briefTimer.current = setTimeout(async () => {
      setSavingBrief(true)
      try {
        await patch({ briefJson: json ? JSON.stringify(json) : null })
      } catch (e) {
        toast.error(`Falha ao salvar brief: ${e instanceof Error ? e.message : e}`)
      } finally {
        setSavingBrief(false)
      }
    }, 1500)
  }
  function scheduleScriptSave(json: unknown) {
    setScriptJson(json)
    if (scriptTimer.current) clearTimeout(scriptTimer.current)
    scriptTimer.current = setTimeout(async () => {
      setSavingScript(true)
      try {
        await patch({ scriptJson: json ? JSON.stringify(json) : null })
      } catch (e) {
        toast.error(`Falha ao salvar roteiro: ${e instanceof Error ? e.message : e}`)
      } finally {
        setSavingScript(false)
      }
    }, 1500)
  }

  async function setStatus(next: ProductionStatus) {
    try {
      await patch({ status: next })
      toast.success(`Status: ${STATUS_LABEL_PT[next]}`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function saveChain(approverIds: string[]): Promise<boolean> {
    try {
      await patch({ approverIds })
      await load()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  async function destroy() {
    if (!confirm("Deletar esta produção? Essa ação não pode ser desfeita.")) return
    try {
      const res = await fetch(`/api/productions/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha ao deletar")
      toast.success("Produção deletada")
      router.push("/productions")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const [sendingForApproval, setSendingForApproval] = useState(false)
  async function sendForApproval() {
    if (!production) return
    if (!confirm(`Enviar "${production.title}" pro primeiro aprovador? O WhatsApp dispara agora.`)) return
    setSendingForApproval(true)
    try {
      const res = await fetch(`/api/productions/${id}/send-approval`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha ao enviar")
      const sentLabel = data.sentVia === "meta_cloud" ? "WhatsApp enviado pro" : "Link gerado pra"
      toast.success(`${sentLabel} ${data.approver?.name ?? "aprovador"} (passo ${data.stepOrder}/${data.totalSteps})`)
      if (data.dispatchReason) {
        toast.warning(`WhatsApp não enviou: ${data.dispatchReason}. Use "Reenviar via WA" no banner.`)
      }
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSendingForApproval(false)
    }
  }

  const transitions = useMemo(() => {
    if (!production) return []
    return availableTransitions(production.status)
  }, [production])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (error || !production) {
    return (
      <div className="p-8">
        <Link href="/productions" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="h-3.5 w-3.5" />
          Voltar
        </Link>
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-base text-destructive">
          {error ?? "Produção não encontrada"}
        </div>
      </div>
    )
  }

  const chainEditDisabled = production.status === "awaiting_approval"

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <Link
          href="/productions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Voltar para Produções
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Header */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={production.title}
                onChange={(e) => setProduction({ ...production, title: e.target.value })}
                onBlur={(e) => {
                  if (e.target.value !== production.title) return
                  patch({ title: e.target.value }).catch(() => toast.error("Falha ao salvar título"))
                }}
                className="min-w-0 flex-1 bg-transparent text-3xl tracking-tight focus:outline-none focus:ring-2 focus:ring-ring rounded"
              />
              <StatusPill status={production.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {production.type === "podcast" ? "Podcast" : "Vídeo"}
              {production.specialistName ? ` · ${production.specialistName}` : ""}
            </p>
          </div>

          {/* Brief */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground">
                Brief
              </h2>
              <span className="text-[13px] text-muted-foreground">
                {savingBrief ? "Salvando…" : "Auto-save"}
              </span>
            </div>
            <ScriptEditor
              initialJson={production.briefJson ? JSON.parse(production.briefJson) : null}
              onUpdate={scheduleBriefSave}
              placeholder="O que o cliente quer cobrir? Pauta, ângulos, referências…"
            />
          </section>

          {/* Script */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground">
                Roteiro
              </h2>
              <span className="text-[13px] text-muted-foreground">
                {savingScript ? "Salvando…" : "Auto-save"}
              </span>
            </div>
            <ScriptEditor
              initialJson={production.scriptJson ? JSON.parse(production.scriptJson) : null}
              onUpdate={scheduleScriptSave}
              placeholder="Escreva o roteiro pro especialista seguir…"
              className="min-h-[400px]"
            />
          </section>

          {/* Specialist + dates */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data de gravação</Label>
              <Input
                type="datetime-local"
                value={toInputDate(production.recordingDate)}
                onChange={(e) =>
                  patch({ recordingDate: e.target.value || null })
                    .then(() => setProduction({ ...production, recordingDate: e.target.value || null }))
                    .catch((err) => toast.error(String(err)))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data de entrega</Label>
              <Input
                type="datetime-local"
                value={toInputDate(production.deliveryDate)}
                onChange={(e) =>
                  patch({ deliveryDate: e.target.value || null })
                    .then(() => setProduction({ ...production, deliveryDate: e.target.value || null }))
                    .catch((err) => toast.error(String(err)))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data de publicação</Label>
              <Input
                type="datetime-local"
                value={toInputDate(production.publishDate)}
                onChange={(e) =>
                  patch({ publishDate: e.target.value || null })
                    .then(() => setProduction({ ...production, publishDate: e.target.value || null }))
                    .catch((err) => toast.error(String(err)))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>URL do vídeo final</Label>
              <Input
                type="url"
                placeholder="https://…"
                value={production.finalVideoUrl ?? ""}
                onChange={(e) => setProduction({ ...production, finalVideoUrl: e.target.value || null })}
                onBlur={() =>
                  patch({ finalVideoUrl: production.finalVideoUrl ?? null }).catch((err) =>
                    toast.error(String(err)),
                  )
                }
              />
            </div>
          </section>

          {/* Comments thread */}
          <CommentThread productionId={production.id} />

          {/* Danger zone */}
          <section className="border-t pt-4">
            <Button variant="ghost" size="sm" onClick={destroy} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Deletar produção
            </Button>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          {/* Status + transitions */}
          <div className="rounded-lg border bg-card p-4">
            <StatusTimeline
              status={production.status}
              createdAt={null}
              recordingDate={production.recordingDate}
              deliveryDate={production.deliveryDate}
              publishDate={production.publishDate}
              updatedAt={production.updatedAt}
            />
            {transitions.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Mover para
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {transitions.map((t) => (
                    <Button
                      key={t}
                      variant="outline"
                      size="sm"
                      onClick={() => setStatus(t)}
                      className="text-sm"
                    >
                      {STATUS_LABEL_PT[t]}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Approver chain */}
          <div className="rounded-lg border bg-card p-4">
            <ApproverChainEditor
              initial={chain.map((c) => c.approver)}
              available={approvers}
              onSave={saveChain}
              disabled={chainEditDisabled}
              onApproverCreated={async () => {
                const r = await fetch("/api/approvers")
                const d = await r.json()
                setApprovers(d.approvers ?? [])
              }}
            />
            {chainEditDisabled && (
              <p className="mt-2 text-[13px] text-muted-foreground">
                Chain travada enquanto está em aprovação. Volte pra elaboração pra editar.
              </p>
            )}
          </div>

          {/* Send for approval / resubmit after revision */}
          {(production.status === "script_drafting" || production.status === "revision_requested") &&
            chain.length > 0 && (
              <Button
                className="w-full"
                size="lg"
                onClick={sendForApproval}
                disabled={sendingForApproval}
                title={
                  production.status === "revision_requested"
                    ? "Reenviar pra aprovação após revisão (round + 1)"
                    : "Enviar pro primeiro aprovador da chain"
                }
              >
                {sendingForApproval ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {production.status === "revision_requested" ? "Reenviar pra aprovação" : "Enviar pra aprovação"}
              </Button>
            )}
          {production.status === "awaiting_approval" && (
            <p className="rounded-md border border-dashed bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Aguardando decisão do aprovador. Quando ele aprovar, dispara o próximo da chain (ou marca aprovado se for o último).
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}

function toInputDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  // Convert UTC ISO to local datetime-local format YYYY-MM-DDTHH:mm.
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}

function availableTransitions(from: ProductionStatus): ProductionStatus[] {
  // Mirror of TRANSITIONS.agency in lib/productions.ts. Duplicated here
  // for a quick UI render — server is the source of truth via canTransition.
  const map: Partial<Record<ProductionStatus, ProductionStatus[]>> = {
    brief_pending: ["script_drafting", "archived"],
    script_drafting: ["awaiting_approval", "brief_pending", "archived"],
    awaiting_approval: ["script_drafting", "revision_requested", "approved", "archived"],
    revision_requested: ["script_drafting", "archived"],
    approved: ["recording", "script_drafting", "archived"],
    recording: ["editing", "approved", "archived"],
    editing: ["delivered", "recording", "archived"],
    delivered: ["published", "editing", "archived"],
    published: ["archived"],
    archived: ["script_drafting"],
  }
  return map[from] ?? []
}
