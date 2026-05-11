"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Send } from "lucide-react"

// Per-client "Notificar pendentes" button shown on the dashboard's
// Aprovações widget. Fires POST /api/clients/[id]/notify-pending which
// groups all pending approvalLinks by approver phone and dispatches ONE
// digest WhatsApp per recipient. Used when the client has
// approvalDispatchMode='manual' — the cron has been creating links
// silently and the agency clicks this when it's time to actually nudge.
export function NotifyPendingButton({ clientId, pendingCount }: { clientId: string; pendingCount: number }) {
  const [sending, setSending] = useState(false)

  async function notify() {
    if (sending) return
    if (!confirm(`Disparar ${pendingCount} WhatsApp${pendingCount === 1 ? "" : "s"} pra notificar pendentes deste cliente?`)) return
    setSending(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/notify-pending`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? "Erro ao notificar")
      const dispatched = data?.dispatched ?? 0
      const skipped = data?.skipped ?? 0
      const errors: Array<{ phone: string; reason: string }> = data?.errors ?? []
      if (dispatched > 0 && errors.length === 0) {
        toast.success(`${dispatched} pendência${dispatched === 1 ? "" : "s"} notificada${dispatched === 1 ? "" : "s"} via ManyChat`)
      } else if (dispatched > 0) {
        toast.warning(`${dispatched} enviada${dispatched === 1 ? "" : "s"}; ${errors.length} falhou${errors.length === 1 ? "" : "ram"}`)
      } else {
        toast.error(`Nenhum WhatsApp enviado. ${errors[0]?.reason ?? "Sem destinatários válidos."}`)
      }
      if (skipped > 0) {
        toast.info(`${skipped} pendência${skipped === 1 ? "" : "s"} sem telefone — pula${skipped === 1 ? "" : "m"} a notificação.`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <button
      onClick={notify}
      disabled={sending || pendingCount === 0}
      title={`Disparar ${pendingCount} WhatsApp pra este cliente`}
      className="inline-flex h-5 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 text-[10px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
    >
      {sending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Send className="h-2.5 w-2.5" />}
      Notificar
    </button>
  )
}
