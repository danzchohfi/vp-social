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
      if (expired === 0) {
        toast.info("Nenhum link órfão encontrado — a contagem já reflete o Notion.")
      } else {
        toast.success(`${expired} link${expired === 1 ? "" : "s"} órfão${expired === 1 ? "" : "s"} marcado${expired === 1 ? "" : "s"} como expirado${expired === 1 ? "" : "s"}. Recarregue a página pra ver a contagem atualizada.`)
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
