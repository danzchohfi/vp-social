"use client"
/**
 * Magic Approver Portal — `/a/[token]`.
 *
 * Listing surface for one approver across every production they need to
 * decide on. The token (approver.magicToken) authenticates the listing.
 * Each row's per-item action uses the existing /api/approve/[itemToken]
 * endpoint — the per-item token is itself self-authenticating, so the
 * portal stays a thin shell.
 *
 * Mobile-first; matches the visual language of /approve/[token] and
 * /c/[token]. No auth UI, no signup pitch — the WhatsApp link is the
 * entry point and that's the contract.
 */

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MessageCircle,
  Sparkles,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type PendingItem = {
  approvalLinkToken: string
  productionId: string | null
  productionTitle: string
  clientName: string | null
  stepOrder: number
  totalSteps: number
  round: number
  sentAt: string | null
  expiresAt: string
  previousApprovers: Array<{ name: string; approvedAt: string }>
}

type HistoryItem = {
  approvalLinkToken: string
  productionId: string | null
  productionTitle: string
  clientName: string | null
  decision: "approved" | "changes_requested"
  decidedAt: string | null
  round: number
  comment: string | null
}

type ApiResponse = {
  approver: { id: string; name: string; email: string | null; phone: string | null; role: string }
  pending: PendingItem[]
  history: HistoryItem[]
  error?: string
}

export default function ApproverPortalPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<"pending" | "history">("pending")
  const [decidingToken, setDecidingToken] = useState<string | null>(null)
  const [revisionFor, setRevisionFor] = useState<string | null>(null)
  const [revisionComment, setRevisionComment] = useState("")

  const load = useCallback(async (silent = false) => {
    if (!token) return
    if (!silent) setLoading(true)
    try {
      const res = await fetch(`/api/a/${token}`)
      if (!res.ok) {
        if (res.status === 404) setError("not_found")
        else setError("load_failed")
        setData(null)
        return
      }
      const json = (await res.json()) as ApiResponse
      setData(json)
      setError(null)
    } catch {
      if (!silent) setError("load_failed")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    load()
    // Light polling so a freshly-completed prior step shows up here
    // without the approver having to refresh manually.
    const t = setInterval(() => load(true), 15000)
    return () => clearInterval(t)
  }, [load])

  async function approveOne(itemToken: string) {
    setDecidingToken(itemToken)
    try {
      const res = await fetch(`/api/approve/${itemToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? "Falha ao aprovar")
      toast.success("Aprovado")
      await load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setDecidingToken(null)
    }
  }

  async function requestChanges(itemToken: string) {
    if (!revisionComment.trim()) {
      toast.error("Descreva o que precisa mudar")
      return
    }
    setDecidingToken(itemToken)
    try {
      const res = await fetch(`/api/approve/${itemToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "changes_requested", comment: revisionComment.trim() }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? "Falha ao enviar")
      toast.success("Pedido de alterações enviado")
      setRevisionFor(null)
      setRevisionComment("")
      await load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setDecidingToken(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error === "not_found" || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
            <h1 className="mb-2 font-display text-lg">Link inválido ou revogado</h1>
            <p className="text-sm text-muted-foreground">
              Esse portal foi desativado. Peça à agência um novo link.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { approver, pending, history } = data

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Portal do aprovador</p>
            <h1 className="truncate font-display text-lg">Olá, {approver.name}</h1>
          </div>
        </header>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-lg bg-card p-1 text-sm">
          <button
            type="button"
            onClick={() => setTab("pending")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 font-medium transition",
              tab === "pending"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Aguardando você ({pending.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 font-medium transition",
              tab === "history"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Histórico ({history.length})
          </button>
        </div>

        {/* Pending */}
        {tab === "pending" && (
          <div className="space-y-3">
            {pending.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-success" />
                  <p className="text-sm text-muted-foreground">
                    Nada esperando você agora. Voltamos a avisar quando algo precisar de aprovação.
                  </p>
                </CardContent>
              </Card>
            ) : (
              pending.map((p) => (
                <Card key={p.approvalLinkToken} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-base">{p.productionTitle}</p>
                        {p.clientName && (
                          <p className="truncate text-xs text-muted-foreground">{p.clientName}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Aprovação {p.stepOrder}/{p.totalSteps} · revisão {p.round}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-4">
                    {p.previousApprovers.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="uppercase tracking-wider">Já aprovaram:</span>
                        {p.previousApprovers.map((prev, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-success"
                          >
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {prev.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {p.sentAt ? `Enviado ${timeAgo(p.sentAt)}` : "Aguardando envio"}
                      <span>·</span>
                      <span>Expira {timeAgo(p.expiresAt, true)}</span>
                    </div>

                    {revisionFor === p.approvalLinkToken ? (
                      <div className="space-y-2 rounded-md border bg-muted/20 p-2">
                        <textarea
                          value={revisionComment}
                          onChange={(e) => setRevisionComment(e.target.value)}
                          placeholder="O que precisa mudar?"
                          rows={3}
                          className="w-full resize-none rounded border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRevisionFor(null)
                              setRevisionComment("")
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => requestChanges(p.approvalLinkToken)}
                            disabled={decidingToken === p.approvalLinkToken || !revisionComment.trim()}
                          >
                            {decidingToken === p.approvalLinkToken ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <MessageCircle className="h-3.5 w-3.5" />
                            )}
                            Enviar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <Button
                          size="sm"
                          onClick={() => approveOne(p.approvalLinkToken)}
                          disabled={decidingToken === p.approvalLinkToken}
                          className="col-span-2 sm:col-span-1"
                        >
                          {decidingToken === p.approvalLinkToken ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRevisionFor(p.approvalLinkToken)
                            setRevisionComment("")
                          }}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Pedir alterações
                        </Button>
                        <Button size="sm" variant="ghost" asChild>
                          <a href={`/approve/${p.approvalLinkToken}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Abrir
                          </a>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* History */}
        {tab === "history" && (
          <div className="space-y-2">
            {history.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">Nenhuma decisão nos últimos 30 dias.</p>
                </CardContent>
              </Card>
            ) : (
              history.map((h) => (
                <Card key={h.approvalLinkToken}>
                  <CardContent className="flex items-start gap-3 py-3">
                    <div
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        h.decision === "approved"
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {h.decision === "approved" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{h.productionTitle}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {h.clientName ? `${h.clientName} · ` : ""}
                        {h.decision === "approved" ? "Aprovado" : "Pediu alterações"}
                        {h.decidedAt ? ` · ${timeAgo(h.decidedAt)}` : ""}
                        {` · revisão ${h.round}`}
                      </p>
                      {h.comment && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{h.comment}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function timeAgo(iso: string, future = false): string {
  const diff = future
    ? new Date(iso).getTime() - Date.now()
    : Date.now() - new Date(iso).getTime()
  const prefix = future ? "em " : "há "
  if (diff < 0) return future ? "expirado" : "agora"
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return future ? "em segundos" : "agora"
  if (mins < 60) return `${prefix}${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${prefix}${hours}h`
  const days = Math.floor(hours / 24)
  return `${prefix}${days}d`
}
