"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSession } from "@/lib/auth-client"
import { toast } from "sonner"

type Workspace = {
  id: string
  workspaceName: string
  workspaceIcon: string | null
  databaseId: string | null
  databaseName: string | null
}

type FieldMapping = {
  statusField: string; statusReadyValue: string; statusPublishedValue: string; statusErrorValue: string
  dateField: string; captionField: string; hashtagsField: string
  tipoField: string; plataformasField: string
  accountField: string
  feedImageUrlsField: string; verticalUrlsField: string; horizontalUrlsField: string; thumbnailUrlField: string
  likesField: string; commentsField: string; reachField: string; savesField: string; impressionsField: string
}

const DEFAULT_MAPPING: FieldMapping = {
  statusField: "Status", statusReadyValue: "Pronto", statusPublishedValue: "Publicado", statusErrorValue: "Erro",
  dateField: "Data", captionField: "Legenda", hashtagsField: "Hashtags",
  tipoField: "Tipo", plataformasField: "Plataformas",
  accountField: "Conta",
  feedImageUrlsField: "Imagens Feed", verticalUrlsField: "Mídia Vertical", horizontalUrlsField: "Mídia Horizontal", thumbnailUrlField: "Thumbnail",
  likesField: "", commentsField: "", reachField: "", savesField: "", impressionsField: "",
}

function SelectField({ label, value, options, onChange, hint }: { label: string; value: string; options: string[]; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecionar campo..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [dbUrl, setDbUrl] = useState("")
  const [dbName, setDbName] = useState<string | null>(null)
  const [propNames, setPropNames] = useState<string[]>([])
  const [mapping, setMapping] = useState<FieldMapping>(DEFAULT_MAPPING)
  const [saving, setSaving] = useState(false)
  const [loadingDb, setLoadingDb] = useState(false)

  useEffect(() => {
    fetch("/api/notion/workspaces").then(r => r.json()).then(setWorkspaces)
  }, [])

  const selected = workspaces.find(w => w.id === selectedId)

  useEffect(() => {
    if (!selectedId) return
    fetch(`/api/notion/workspaces/${selectedId}/mapping`).then(r => r.json()).then((data) => {
      setMapping({ ...DEFAULT_MAPPING, ...data })
    })
    if (selected?.databaseId) {
      setDbUrl("")
      setDbName(selected.databaseName)
      fetch(`/api/notion/workspaces/${selectedId}/props`).then(r => r.json()).then(data => {
        if (Array.isArray(data)) setPropNames(data)
      })
    } else {
      setDbName(null)
      setPropNames([])
    }
  }, [selectedId])

  const allPropNames = propNames.length ? ["", ...propNames] : ["", mapping.statusField, mapping.dateField, mapping.captionField, mapping.hashtagsField, mapping.tipoField, mapping.plataformasField, mapping.accountField, mapping.feedImageUrlsField, mapping.verticalUrlsField, mapping.horizontalUrlsField, mapping.thumbnailUrlField].filter(Boolean)

  function setField(key: keyof FieldMapping, value: string) {
    setMapping(prev => ({ ...prev, [key]: value }))
  }

  async function connectDb() {
    if (!selectedId || !dbUrl.trim()) return
    setLoadingDb(true)
    const res = await fetch(`/api/notion/workspaces/${selectedId}/database`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: dbUrl.trim() }),
    })
    const data = await res.json()
    setLoadingDb(false)
    if (!res.ok) { toast.error(data.error ?? "Erro ao conectar banco"); return }
    setDbName(data.name)
    setPropNames(data.props ?? [])
    toast.success(`Banco "${data.name}" conectado!`)
    setWorkspaces(ws => ws.map(w => w.id === selectedId ? { ...w, databaseId: data.id, databaseName: data.name } : w))
  }

  async function save() {
    if (!selectedId) return
    setSaving(true)
    const res = await fetch(`/api/notion/workspaces/${selectedId}/mapping`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapping),
    })
    setSaving(false)
    if (res.ok) toast.success("Mapeamento salvo!")
    else toast.error("Erro ao salvar")
  }

  if (!session) return null

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-8 px-4">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground mt-1">Configure seus workspaces do Notion e o mapeamento de campos.</p>
      </div>

      <div className="space-y-3">
        <Label>Workspace do Notion</Label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione um workspace..." />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.workspaceIcon && <span className="mr-2">{w.workspaceIcon}</span>}{w.workspaceName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {workspaces.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum workspace conectado. <a href="/onboarding" className="underline">Conectar Notion</a></p>
        )}
      </div>

      {selectedId && (
        <>
          <div className="space-y-3">
            <Label>Banco de dados do Notion</Label>
            {dbName ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-green-600">✓ {dbName}</span>
                <Button variant="outline" size="sm" onClick={() => { setDbName(null); setDbUrl("") }}>Trocar</Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Cole a URL do banco do Notion aqui..."
                  value={dbUrl}
                  onChange={e => setDbUrl(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={connectDb} disabled={loadingDb || !dbUrl.trim()}>
                  {loadingDb ? "Conectando..." : "Conectar"}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Abra o banco no Notion, clique em ⋯ → Copiar link e cole aqui.
            </p>
          </div>

          {dbName && (
            <div className="space-y-6">
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Campo de Status" value={mapping.statusField} options={allPropNames} onChange={(v) => setField("statusField", v)} />
                  <div className="space-y-1">
                    <Label className="text-sm">Valor &quot;Pronto para publicar&quot;</Label>
                    <Input value={mapping.statusReadyValue} onChange={e => setField("statusReadyValue", e.target.value)} placeholder="ex: Pronto" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Valor &quot;Publicado&quot;</Label>
                    <Input value={mapping.statusPublishedValue} onChange={e => setField("statusPublishedValue", e.target.value)} placeholder="ex: Publicado" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Valor &quot;Erro&quot;</Label>
                    <Input value={mapping.statusErrorValue} onChange={e => setField("statusErrorValue", e.target.value)} placeholder="ex: Erro" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agendamento</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Data de publicação" value={mapping.dateField} options={allPropNames} onChange={(v) => setField("dateField", v)} />
                  <SelectField label="Conta" value={mapping.accountField} options={allPropNames} onChange={(v) => setField("accountField", v)} hint="Deve bater com o nome da conta no app" />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conteúdo</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Legenda" value={mapping.captionField} options={allPropNames} onChange={(v) => setField("captionField", v)} />
                  <SelectField label="Hashtags" value={mapping.hashtagsField} options={allPropNames} onChange={(v) => setField("hashtagsField", v)} />
                  <SelectField label="Publicar em" value={mapping.tipoField} options={allPropNames} onChange={(v) => setField("tipoField", v)} hint="IG Reels, IG Story, IG Feed…" />
                  <SelectField label="Plataformas" value={mapping.plataformasField} options={allPropNames} onChange={(v) => setField("plataformasField", v)} />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mídia</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Imagens Feed" value={mapping.feedImageUrlsField} options={allPropNames} onChange={(v) => setField("feedImageUrlsField", v)} />
                  <SelectField label="Mídia Vertical" value={mapping.verticalUrlsField} options={allPropNames} onChange={(v) => setField("verticalUrlsField", v)} hint="Stories, Reels" />
                  <SelectField label="Mídia Horizontal" value={mapping.horizontalUrlsField} options={allPropNames} onChange={(v) => setField("horizontalUrlsField", v)} />
                  <SelectField label="Thumbnail" value={mapping.thumbnailUrlField} options={allPropNames} onChange={(v) => setField("thumbnailUrlField", v)} />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Analytics (opcional)</p>
                <p className="text-xs text-muted-foreground">Crie campos Number no Notion e mapeie aqui para sincronizar métricas automaticamente.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Curtidas" value={mapping.likesField} options={allPropNames} onChange={(v) => setField("likesField", v)} />
                  <SelectField label="Comentários" value={mapping.commentsField} options={allPropNames} onChange={(v) => setField("commentsField", v)} />
                  <SelectField label="Alcance" value={mapping.reachField} options={allPropNames} onChange={(v) => setField("reachField", v)} />
                  <SelectField label="Salvamentos" value={mapping.savesField} options={allPropNames} onChange={(v) => setField("savesField", v)} />
                  <SelectField label="Impressões" value={mapping.impressionsField} options={allPropNames} onChange={(v) => setField("impressionsField", v)} />
                </div>
              </div>

              <Button onClick={save} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar mapeamento"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
