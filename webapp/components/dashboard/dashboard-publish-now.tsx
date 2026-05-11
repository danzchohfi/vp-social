"use client"
import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Zap } from "lucide-react"

// Per-row "Publicar agora" on the dashboard's next-publications widget.
// Same backend as /scheduled's PostRow — we just don't reload-the-page,
// since dashboard data comes from server props. A toast is enough.
export function DashboardPublishNow({
  pageId,
  connectionId,
}: {
  pageId: string
  connectionId: string
}) {
  const [publishing, setPublishing] = useState(false)

  async function publishNow() {
    if (!confirm("Publicar este post agora?")) return
    setPublishing(true)
    try {
      const res = await fetch("/api/posts/publish-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, connectionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao publicar")
      const ok = (data.results ?? []).filter((r: any) => r.status === "published").length
      const fail = (data.results ?? []).filter((r: any) => r.status === "failed").length
      if (ok > 0 && fail === 0) toast.success(`Publicado em ${ok} plataforma(s)!`)
      else if (ok > 0) toast.warning(`${ok} publicado(s), ${fail} falhou(aram)`)
      else toast.error(fail > 0 ? `Falha ao publicar (${fail})` : "Nenhuma plataforma publicou")
      // Soft refresh so the row drops out of "próximas" and shows up in atividade.
      setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e))
    } finally {
      setPublishing(false)
    }
  }

  return (
    <button
      onClick={publishNow}
      disabled={publishing}
      title="Publicar imediatamente"
      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-60"
    >
      {publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
      {publishing ? "Publicando..." : "Publicar agora"}
    </button>
  )
}
