"use client"
import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Switches the active-client cookie via /api/clients/active and reloads.
// Used by the dashboard's inactive-clients list and (via wrapper) by the
// agency per-client cards. Both surfaces want the same end state: become
// the single-client view for that client.
export function SwitchClientButton({
  clientId,
  children,
  className,
}: {
  clientId: string
  children: React.ReactNode
  className?: string
}) {
  const [loading, setLoading] = useState(false)

  async function handle() {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch("/api/clients/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao trocar de cliente")
      window.location.reload()
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e))
      setLoading(false)
    }
  }

  return (
    <button onClick={handle} disabled={loading} className={cn("text-left", className)}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  )
}
