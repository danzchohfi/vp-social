"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Trash2 } from "lucide-react"

// On-demand cleanup of approvalLink rows whose Notion post is no
// longer in the awaiting-approval status. Shown next to the
// per-client Notificar button so the user can reconcile the
// dashboard count (10) with what Notion actually shows (1).
export function ExpireOrphansButton({ clientId }: { clientId: string }) {
  const [working, setWorking] = useState(false)

  async function run() {
    if (working) return
    setWorking(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/expire-orphans`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? "Erro ao limpar")
      const expired = data?.expired ?? 0
      const totalPending = data?.totalPendingLinksBefore ?? 0
      const totalAwaiting = data?.totalAwaitingAcrossConnections ?? 0
      const sample: Array<{ title: string }> = data?.orphanSample ?? []
      if (expired === 0) {
        // Helpful breakdown: how many links exist vs. how many posts the
        // cron sees in awaiting status. If pending > awaiting and we
        // still cleaned 0, something else is going on (e.g. sent links
        // that we don't expire by design).
        toast.info(`Nenhum órfão. ${totalPending} link(s) pendente(s) no banco vs ${totalAwaiting} post(s) realmente aguardando no Notion. Veja /scheduled pra inspecionar cada um.`, { duration: 8000 })
      } else {
        const titles = sample.slice(0, 3).map((s) => `"${s.title}"`).join(", ")
        toast.success(`${expired} órfão(s) expirado(s)${titles ? ` — ${titles}${sample.length > 3 ? `, +${sample.length - 3}` : ""}` : ""}. Recarregue a página.`, { duration: 8000 })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setWorking(false)
    }
  }

  return (
    <button
      onClick={run}
      disabled={working}
      title="Marcar como expirado os links pendentes cujo post não está mais aguardando no Notion"
      className="inline-flex h-5 items-center gap-1 rounded-md border border-muted px-1.5 text-[12px] font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
    >
      {working ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
      Limpar órfãos
    </button>
  )
}
