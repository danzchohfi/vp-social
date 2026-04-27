"use client"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BookOpen, Loader2, CheckCircle2, ExternalLink } from "lucide-react"

type NotionConnection = { workspaceName: string; databaseName: string | null; databaseId: string | null }
type FieldMapping = {
  titleField: string; captionField: string; mediaVerticalField: string
  mediaHorizontalField: string; statusField: string; statusReadyValue: string
  statusPublishedValue: string; statusErrorValue: string; dateField: string; accountField: string
}

export default function SettingsPage() {
  const [notion, setNotion] = useState<NotionConnection | null>(null)
  const [mapping, setMapping] = useState<FieldMapping | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/notion/connection").then((r) => r.json()),
      fetch("/api/settings/mapping").then((r) => r.json()),
    ]).then(([n, m]) => {
      setNotion(n.connection)
      setMapping(m.mapping || {
        titleField: "Produção", captionField: "Legenda",
        mediaVerticalField: "Mídia Vertical", mediaHorizontalField: "Mídia Horizontal",
        statusField: "Status", statusReadyValue: "Agendamento",
        statusPublishedValue: "Publicado", statusErrorValue: "Erro",
        dateField: "Dia para fazer", accountField: "Conta",
      })
      setLoading(false)
    })
  }, [])

  async function handleNotionConnect() {
    setConnecting(true)
    const res = await fetch("/api/notion/auth-url")
    const { url } = await res.json()
    window.location.href = url
  }

  async function handleSaveMapping(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch("/api/settings/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapping),
    })
    toast.success("Configurações salvas!")
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Configure a conexão com o Notion e o mapeamento de campos</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Notion Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Notion</CardTitle>
            <CardDescription>Conecte seu workspace e selecione o banco de dados</CardDescription>
          </CardHeader>
          <CardContent>
            {notion ? (
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="font-medium">{notion.workspaceName}</p>
                    <p className="text-sm text-muted-foreground">
                      {notion.databaseName ? `Banco: ${notion.databaseName}` : "Nenhum banco selecionado"}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleNotionConnect}>Reconectar</Button>
              </div>
            ) : (
              <Button onClick={handleNotionConnect} disabled={connecting} className="w-full">
                {connecting ? <Loader2 className="animate-spin" /> : <BookOpen />}
                Conectar Notion
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Field Mapping */}
        {mapping && (
          <Card>
            <CardHeader>
              <CardTitle>Mapeamento de campos</CardTitle>
              <CardDescription>Defina quais colunas do Notion correspondem a cada campo</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveMapping} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { key: "titleField", label: "Título" },
                    { key: "captionField", label: "Legenda" },
                    { key: "mediaVerticalField", label: "Mídia Vertical (Instagram)" },
                    { key: "mediaHorizontalField", label: "Mídia Horizontal (YouTube)" },
                    { key: "statusField", label: "Campo de Status" },
                    { key: "statusReadyValue", label: "Valor: Pronto para publicar" },
                    { key: "statusPublishedValue", label: "Valor: Publicado" },
                    { key: "statusErrorValue", label: "Valor: Erro" },
                    { key: "dateField", label: "Data de publicação" },
                    { key: "accountField", label: "Campo de Conta" },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-1.5">
                      <Label>{label}</Label>
                      <Input
                        value={mapping[key as keyof FieldMapping]}
                        onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="animate-spin" />}
                  Salvar configurações
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
