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

type NotionDatabase = { id: string; name: string }
type PropInfo = { name: string; type: string; options: string[] }

type FieldMapping = {
  statusField: string; statusReadyValue: string; statusPublishedValue: string; statusErrorValue: string
  dateField: string; captionField: string
  publicarEmField: string
  accountField: string
  feedImageUrlsField: string; verticalUrlsField: string; horizontalUrlsField: string; thumbnailUrlField: string
  likesField: string; commentsField: string; reachField: string; savesField: string; impressionsField: string
}

const DEFAULT_MAPPING: FieldMapping = {
  statusField: "Status", statusReadyValue: "Pronto", statusPublishedValue: "Publicado", statusErrorValue: "Erro",
  dateField: "Data", captionField: "Legenda",
  publicarEmField: "Publicar em",
  accountField: "Conta",
  feedImageUrlsField: "Imagens Feed", verticalUrlsField: "Mídia Vertical", horizontalUrlsField: "Mídia Horizontal", thumbnailUrlField: "Thumbnail",
  likesField: "", commentsField: "", reachField: "", savesField: "", impressionsField: "",
}

const NONE_VALUE = "__none__"

function SelectField({ label, value, options, onChange, hint }: { label: string; value: string; options: string[]; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Select value={value || NONE_VALUE} onValueChange={(v) => onChange(v === NONE_VALUE ? "" : v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecionar campo..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>— Não usar —</SelectItem>
          {options.filter(Boolean).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function StatusValueSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  if (!options.length) {
    return (
      <div className="space-y-1">
        <Label className="text-sm">{label}</Label>
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder="Selecione um campo de Status acima" disabled />
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      <Select value={value || NONE_VALUE} onValueChange={(v) => onChange(v === NONE_VALUE ? "" : v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecionar valor..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>— Não usar —</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function normalizeProps(data: any): PropInfo[] {
  if (!Array.isArray(data)) return []
  return data.map((p: any) => {
    if (typeof p === "string") return { name: p, type: "unknown", options: [] }
    return { name: p.name, type: p.type ?? "unknown", options: Array.isArray(p.options) ? p.options : [] }
  })
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [dbUrl, setDbUrl] = useState("")
  const [dbName, setDbName] = useState<string | null>(null)
  const [props, setProps] = useState<PropInfo[]>([])
  const [mapping, setMapping] = useState<FieldMapping>(DEFAULT_MAPPING)
  const [saving, setSaving] = useState(false)
  const [loadingDb, setLoadingDb] = useState(false)
  const [databases, setDatabases] = useState<NotionDatabase[]>([])
  const [selectedDbId, setSelectedDbId] = useState("")
  const [loadingDbs, setLoadingDbs] = useState(false)

  useEffect(() => {
    fetch("/api/notion/workspaces").then(r => r.json()).then((data: Workspace[]) => {
      setWorkspaces(data)
      if (!data.length) return
      const stored = typeof window !== "undefined" ? localStorage.getItem("vpsocial_selected_workspace") : null
      const valid = stored && data.find(w => w.id === stored)
      setSelectedId(valid ? stored : data[0].id)
    })
  }, [])

  const selected = workspaces.find(w => w.id === selectedId)

  useEffect(() => {
    if (!selectedId) return
    fetch(`/api/notion/workspaces/${selectedId}/mapping`).then(r => r.json()).then((data) => {
      setMapping({ ...DEFAULT_MAPPING, ...data })
    })
    if (selected?.databaseId) {
      setDbUrl("")
      setSelectedDbId("")
      setDbName(selected.databaseName)
      fetch(`/api/notion/workspaces/${selectedId}/props`).then(r => r.json()).then(data => {
        setProps(normalizeProps(data))
      })
    } else {
      setDbName(null)
      setProps([])
      setSelectedDbId("")
      setDbUrl("")
      setLoadingDbs(true)
      fetch(`/api/notion/databases?connectionId=${selectedId}`)
        .then(r => r.json())
        .then((data) => setDatabases(data.databases ?? []))
        .finally(() => setLoadingDbs(false))
    }
  }, [selectedId, selected?.databaseId])

  const propNames = props.length
    ? props.map(p => p.name)
    : [mapping.statusField, mapping.dateField, mapping.captionField, mapping.publicarEmField, mapping.accountField, mapping.feedImageUrlsField, mapping.verticalUrlsField, mapping.horizontalUrlsField, mapping.thumbnailUrlField].filter(Boolean)

  const statusOptions = props.find(p => p.name === mapping.statusField)?.options ?? []

  function setField(key: keyof FieldMapping, value: string) {
    setMapping(prev => ({ ...prev, [key]: value }))
  }

  async function connectDb() {
    if (!selectedId) return
    const idOrUrl = selectedDbId || dbUrl.trim()
    if (!idOrUrl) return
    setLoadingDb(true)
    const res = await fetch(`/api/notion/workspaces/${selectedId}/database`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: idOrUrl }),
    })
    const data = await res.json()
    setLoadingDb(false)
    if (!res.ok) { toast.error(data.error ?? "Erro ao conectar banco"); return }
    setDbName(data.name)
    setProps(normalizeProps(data.props))
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
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight sm:text-4xl">Configurações</h1>
        <p className="text-muted-foreground mt-1">Configure seus workspaces do Notion e o mapeamento de campos.</p>
      </div>

      <div className="space-y-3">
        <Label>Workspace do Notion</Label>
        <Select value={selectedId} onValueChange={(v) => { setSelectedId(v); localStorage.setItem("vpsocial_selected_workspace", v) }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione um workspace..." />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                <span className="flex items-center gap-2">
                  {w.workspaceIcon && (w.workspaceIcon.startsWith("http")
                    ? <img src={w.workspaceIcon} alt="" className="h-4 w-4 rounded" />
                    : <span>{w.workspaceIcon}</span>)}
                  <span>{w.workspaceName || "Sem nome"}</span>
                </span>
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
                <Button variant="outline" size="sm" onClick={() => { setDbName(null); setDbUrl(""); setSelectedDbId("") }}>Trocar</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {loadingDbs ? (
                  <p className="text-sm text-muted-foreground">Carregando bancos com acesso…</p>
                ) : databases.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Bancos com acesso da integração</Label>
                    <Select value={selectedDbId} onValueChange={(v) => { setSelectedDbId(v); setDbUrl("") }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione um banco…" />
                      </SelectTrigger>
                      <SelectContent>
                        {databases.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum banco encontrado automaticamente. Cole a URL abaixo.</p>
                )}

                <div className="space-y-1.5">
                  <Label className="text-sm">{databases.length > 0 ? "Ou cole a URL do banco" : "URL do banco"}</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://notion.so/workspace/Titulo-xxxxxxxx"
                      value={dbUrl}
                      onChange={e => { setDbUrl(e.target.value); setSelectedDbId("") }}
                      className="flex-1"
                    />
                    <Button onClick={connectDb} disabled={loadingDb || (!dbUrl.trim() && !selectedDbId)}>
                      {loadingDb ? "Conectando..." : "Conectar"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Abra o banco no Notion, clique em ⋯ → Copiar link e cole aqui.
                  </p>
                </div>
              </div>
            )}
          </div>

          {dbName && (
            <div className="space-y-6">
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Campo de Status" value={mapping.statusField} options={propNames} onChange={(v) => setField("statusField", v)} />
                  <StatusValueSelect label='Valor "Pronto para publicar"' value={mapping.statusReadyValue} options={statusOptions} onChange={(v) => setField("statusReadyValue", v)} />
                  <StatusValueSelect label='Valor "Publicado"' value={mapping.statusPublishedValue} options={statusOptions} onChange={(v) => setField("statusPublishedValue", v)} />
                  <StatusValueSelect label='Valor "Erro"' value={mapping.statusErrorValue} options={statusOptions} onChange={(v) => setField("statusErrorValue", v)} />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agendamento</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Data de publicação" value={mapping.dateField} options={propNames} onChange={(v) => setField("dateField", v)} />
                  <SelectField label="Conta" value={mapping.accountField} options={propNames} onChange={(v) => setField("accountField", v)} hint="Deve bater com o nome da conta no app" />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conteúdo</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Legenda" value={mapping.captionField} options={propNames} onChange={(v) => setField("captionField", v)} hint="Inclua hashtags direto na legenda" />
                  <SelectField label="Publicar em" value={mapping.publicarEmField} options={propNames} onChange={(v) => setField("publicarEmField", v)} hint="Multi-select: Instagram Reels, YouTube Shorts, TikTok…" />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mídia</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Imagens Feed" value={mapping.feedImageUrlsField} options={propNames} onChange={(v) => setField("feedImageUrlsField", v)} />
                  <SelectField label="Mídia Vertical" value={mapping.verticalUrlsField} options={propNames} onChange={(v) => setField("verticalUrlsField", v)} hint="Stories, Reels" />
                  <SelectField label="Mídia Horizontal" value={mapping.horizontalUrlsField} options={propNames} onChange={(v) => setField("horizontalUrlsField", v)} />
                  <SelectField label="Thumbnail" value={mapping.thumbnailUrlField} options={propNames} onChange={(v) => setField("thumbnailUrlField", v)} />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Analytics (opcional)</p>
                <p className="text-xs text-muted-foreground">Crie campos Number no Notion e mapeie aqui para sincronizar métricas automaticamente.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Curtidas" value={mapping.likesField} options={propNames} onChange={(v) => setField("likesField", v)} />
                  <SelectField label="Comentários" value={mapping.commentsField} options={propNames} onChange={(v) => setField("commentsField", v)} />
                  <SelectField label="Alcance" value={mapping.reachField} options={propNames} onChange={(v) => setField("reachField", v)} />
                  <SelectField label="Salvamentos" value={mapping.savesField} options={propNames} onChange={(v) => setField("savesField", v)} />
                  <SelectField label="Impressões" value={mapping.impressionsField} options={propNames} onChange={(v) => setField("impressionsField", v)} />
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
