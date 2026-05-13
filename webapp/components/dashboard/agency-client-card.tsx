"use client"
import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Wraps the body of an agency-mode per-client card so the whole card is
// click-to-switch. The card visuals stay on the server side; this client
// shell just adds the cursor + hover affordance + onClick handler.
export function AgencyClientCard({
  clientId,
  inactive,
  children,
}: {
  clientId: string
  inactive?: boolean
  children: React.ReactNode
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
    <button
      type="button"
      onClick={handle}
      disabled={loading}
      className={cn(
        "flex w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/30 hover:bg-accent/60 disabled:opacity-60",
        inactive && "border-warning/40",
      )}
    >
      {loading ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        children
      )}
    </button>
  )
}
