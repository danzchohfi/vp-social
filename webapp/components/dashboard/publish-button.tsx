"use client"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Zap, Loader2 } from "lucide-react"

export function PublishButton() {
  const [loading, setLoading] = useState(false)

  async function handlePublish() {
    setLoading(true)
    try {
      const res = await fetch("/api/publish", { method: "POST" })
      const data = await res.json()
      if (data.triggered) {
        toast.success("Publicação iniciada! Acompanhe o histórico abaixo.")
      } else {
        toast.error("Erro ao iniciar publicação.")
      }
    } catch {
      toast.error("Erro ao conectar com o servidor.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handlePublish} disabled={loading}>
      {loading ? <Loader2 className="animate-spin" /> : <Zap />}
      Publicar agora
    </Button>
  )
}
