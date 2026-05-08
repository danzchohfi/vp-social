"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronLeft, Loader2, Film } from "lucide-react"
import { toast } from "sonner"

export default function NewProductionPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<"video" | "podcast">("video")
  const [topic, setTopic] = useState("")
  const [specialistName, setSpecialistName] = useState("")
  const [specialistContactPhone, setSpecialistContactPhone] = useState("")
  const [specialistContactEmail, setSpecialistContactEmail] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      toast.error("Título obrigatório")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/productions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          type,
          topic: topic.trim() || undefined,
          specialistName: specialistName.trim() || undefined,
          specialistContactPhone: specialistContactPhone.trim() || undefined,
          specialistContactEmail: specialistContactEmail.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar")
      toast.success("Produção criada")
      router.push(`/productions/${data.production.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="mb-6">
        <Link
          href="/productions"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Voltar para Produções
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-2xl">
            <Film className="h-5 w-5 text-muted-foreground" />
            Nova produção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Cardiologista — 5 mitos sobre colesterol"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <div className="inline-flex rounded-md border bg-card p-0.5">
                {[
                  { value: "video" as const, label: "Vídeo" },
                  { value: "podcast" as const, label: "Podcast" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                      type === opt.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="topic">Assunto / pauta</Label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Resumo curto do que o vídeo vai abordar"
              />
              <p className="text-xs text-muted-foreground">
                Vai compor o brief inicial. Pode editar depois com o editor TipTap na página de detalhes.
              </p>
            </div>

            <div className="space-y-1.5 border-t pt-4">
              <Label className="font-semibold">Especialista (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Pessoa que vai aparecer no vídeo. Se preencher, gera link de aprovação pra ela mais tarde.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="specialistName">Nome do especialista</Label>
              <Input
                id="specialistName"
                value={specialistName}
                onChange={(e) => setSpecialistName(e.target.value)}
                placeholder="Ex: Dra. Maria Silva"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="phone">WhatsApp (E.164)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={specialistContactPhone}
                  onChange={(e) => setSpecialistContactPhone(e.target.value)}
                  placeholder="+5511999999999"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={specialistContactEmail}
                  onChange={(e) => setSpecialistContactEmail(e.target.value)}
                  placeholder="maria@exemplo.com"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button asChild variant="ghost">
                <Link href="/productions">Cancelar</Link>
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Criar produção
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
