"use client"
import { useState } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { ArrowRight, Loader2, RefreshCw } from "lucide-react"

// Per-row actions on the dashboard's "Atividade recente" widget. We keep
// it small: a deep link to the post in /scheduled (drives the focus-ring
// effect via ?postId=), and — for failed logs that have a connectionId —
// a Reagendar button that hits the same /api/posts/retry endpoint as the
// /scheduled page.
export function RecentActivityActions({
  notionPageId,
  connectionId,
  status,
}: {
  notionPageId: string
  connectionId: string | null
  status: string
}) {
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    if (!connectionId) return
    if (!confirm("Reagendar este post? Vai voltar para 'Agendamento' e o cron tenta de novo no próximo ciclo.")) return
    setRetrying(true)
    try {
      const res = await fetch("/api/posts/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: notionPageId, connectionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao reagendar")
      toast.success("Post reagendado — vai publicar no próximo ciclo (até 5 min)")
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e))
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {status === "failed" && connectionId && (
        <button
          onClick={retry}
          disabled={retrying}
          title="Reagendar e tentar de novo"
          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
        >
          {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Reagendar
        </button>
      )}
      <Link
        href={`/scheduled?postId=${encodeURIComponent(notionPageId)}`}
        title="Ver no calendário"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
