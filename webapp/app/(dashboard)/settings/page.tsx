"use client"
import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  BookOpen, Loader2, CheckCircle2, ChevronRight, Database, Sliders,
  Trash2, Plus, ChevronDown, ChevronUp
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

type Connection = {
  id: string
  workspaceName: string
  workspaceIcon?: string | null
  databaseId: string | null
  databaseName: string | null
}

type NotionDatabase = { id: string; name: string }
type NotionProperty = { name: string; type: string; options: string[] }

type FieldMapping = {
  titleField: string; captionField: string; hashtagsField: string
  tipoField: string; plataformasField: string
  mediaVerticalField: string; mediaHorizontalField: string
  mediaFeedField: string; thumbnailField: string
  statusField: string; statusReadyValue: string
  statusPublishedValue: string; statusErrorValue: string
  dateField: string; accountField: string
}

const DEFAULT_MAPPING: FieldMapping = {
  titleField: "Produção", captionField: "Legenda", hashtagsField: "Hashtags",
  tipoField: "Tipo", plataformasField: "Plataformas",
  mediaVerticalField: "Mídia Vertical", mediaHorizontalField: "Mídia Horizontal",
  mediaFeedField: "Imagens Feed", thumbnailField: "Thumbnail",
  statusField: "Status", statusReadyValue: "Agendamento",
  statusPublishedValue: "Publicado", statusErrorValue: "Erro",
  dateField: "Dia para fazer", accountField: "Conta",
}

// ─── SelectField ─────────────────────────────────────────────────────────────

function SelectField({
  label, value, options, onChange, hint,
}: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ─── WorkspaceCard ────────────────────────────────────────────────────────────

function WorkspaceCard({
  connection,
  onDisconnect,
}: {
  connection: Connection
  onDisconnect: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(!connection.databaseId)

  // databases
  const [databases, setDatabases] = useState<NotionDatabase[]>([])
  const [loadingDbs, setLoadingDbs] = useState(false)
  const [selectedDbId, setSelectedDbId] = useState(connection.databaseId ?? "")
  const [savingDb, setSavingDb] = useState(false)
  const dbConfirmed = selectedDbId === connection.databaseId && !!connection.databaseId

  // properties + mapping
  const [properties, setProperties] = useState<NotionProperty[]>([])
  const [loadingProps, setLoadingProps] = useState(false)
  const [mapping, setMapping] = useState<FieldMapping>(DEFAULT_MAPPING)
  const [savingMapping, setSavingMapping] = useState(false)

  // load databases on mount
  const fetchDatabases = useCallback(async () => {
    setLoadingDbs(true)
    const res = await fetch(`/api/notion/databases?connectionId=${connection.id}`)
    const data = await res.json()
    setDatabases(data.databases ?? [])
    setLoadingDbs(false)
  }, [connection.id])

  // load properties when db is confirmed
  const fetchProperties = useCallback(async (dbId: string) => {
    setLoadingProps(true)
    const [propsRes, mappingRes] = await Promise.all([
      fetch(`/api/notion/databases/${dbId}/properties?connectionId=${connection.id}`),
      fetch(`/api/settings/mapping?connectionId=${connection.id}`),
    ])
    const propsData = await propsRes.json()
    const mappingData = await mappingRes.json()
    setProperties(propsData.properties ?? [])
    if (mappingData.mapping) setMapping({ ...DEFAULT_MAPPING, ...mappingData.mapping })
    setLoadingProps(false)
  }, [connection.id])

  useEffect(() => { fetchDatabases() }, [fetchDatabases])
  useEffect(() => {
    if (dbConfirmed && connection.databaseId) fetchProperties(connection.databaseId)
  }, [dbConfirmed, connection.databaseId, fetchProperties])

  async function handleSaveDatabase() {
    if (!selectedDbId) return
    setSavingDb(true)
    const db = databases.find((d) => d.id === selectedDbId)
    await fetch("/api/notion/connection", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: connection.id, databaseId: selectedDbId, databaseName: db?.name }),
    })
    connection.databaseId = selectedDbId
    connection.databaseName = db?.name ?? selectedDbId
    await fetchProperties(selectedDbId)
    toast.success(`Banco "${db?.name}" salvo!`)
    setSavingDb(false)
  }

  async function handleSaveMapping() {
    setSavingMapping(true)
    await fetch("/api/settings/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: connection.id, ...mapping }),
    })
    toast.success("Mapeamento salvo!")
    setSavingMapping(false)
  }

  async function handleDisconnect() {
    if (!confirm(`Desconectar workspace "${connection.workspaceName}"? O mapeamento de campos será apagado.`)) return
    await fetch("/api/notion/connection", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: connection.id }),
    })
    onDisconnect(connection.id)
    toast.success("Workspace desconectado.")
  }

  function setField(key: keyof FieldMapping, value: string) {
    setMapping((prev) => ({ ...prev, [key]: value }))
  }

  const allPropNames = properties.map((p) => p.name)
  const statusOptions = properties.find((p) => p.name === mapping.statusField)?.options ?? []

  return (
    <Card>
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-3 text-left"
            onClick={() => setExpanded((v) => !v)}
          >
            {connection.workspaceIcon ? (
              <img src={connection.workspaceIcon} alt="" className="h-9 w-9 rounded-lg" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
                {connection.workspaceName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <CardTitle className="text-base">{connection.workspaceName}</CardTitle>
              <CardDescription>
                {connection.databaseName
                  ? `Banco: ${connection.databaseName}`
                  : "Nenhum banco selecionado"}
              </CardDescription>
            </div>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground ml-2" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground ml-2" />
            )}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive shrink-0"
            onClick={handleDisconnect}
            title="Desconectar workspace"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-6 pt-0">
          {/* Database selector */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4" /> Banco de dados
            </h3>
            {loadingDbs ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando bancos…
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={selectedDbId} onValueChange={setSelectedDbId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um banco de dados…" />
                    </SelectTrigger>
                    <SelectContent>
                      {databases.map((db) => (
                        <SelectItem key={db.id} value={db.id}>{db.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleSaveDatabase}
                  disabled={!selectedDbId || savingDb || selectedDbId === connection.databaseId}
                  className="shrink-0"
                >
                  {savingDb ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  Confirmar
                </Button>
              </div>
            )}
          </section>

          {/* Field mapping */}
          {dbConfirmed && (
            <section className="space-y-5 border-t pt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Sliders className="h-4 w-4" /> Mapeamento de campos
              </h3>

              {loadingProps ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Lendo propriedades…
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identificação</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField label="Título do post" value={mapping.titleField} options={allPropNames} onChange={(v) => setField("titleField", v)} hint="Propriedade title" />
                      <SelectField label="Conta / Cliente" value={mapping.accountField} options={allPropNames} onChange={(v) => setField("accountField", v)} hint="Deve bater com o nome da conta Instagram" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conteúdo</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField label="Legenda" value={mapping.captionField} options={allPropNames} onChange={(v) => setField("captionField", v)} />
                      <SelectField label="Hashtags" value={mapping.hashtagsField} options={allPropNames} onChange={(v) => setField("hashtagsField", v)} />
                      <SelectField label="Tipo de conteúdo" value={mapping.tipoField} options={allPropNames} onChange={(v) => setField("tipoField", v)} hint="Feed, Reel, Story, Carrossel…" />
                      <SelectField label="Plataformas" value={mapping.plataformasField} options={allPropNames} onChange={(v) => setField("plataformasField", v)} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mídias</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField label="Mídia Vertical (9:16)" value={mapping.mediaVerticalField} options={allPropNames} onChange={(v) => setField("mediaVerticalField", v)} hint="Reels, Stories" />
                      <SelectField label="Imagens Feed (1:1 / 4:5)" value={mapping.mediaFeedField} options={allPropNames} onChange={(v) => setField("mediaFeedField", v)} hint="Feed e Carrossel" />
                      <SelectField label="Mídia Horizontal (16:9)" value={mapping.mediaHorizontalField} options={allPropNames} onChange={(v) => setField("mediaHorizontalField", v)} hint="YouTube" />
                      <SelectField label="Thumbnail" value={mapping.thumbnailField} options={allPropNames} onChange={(v) => setField("thumbnailField", v)} hint="Capa do Reel" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agendamento</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField label="Data de publicação" value={mapping.dateField} options={allPropNames} onChange={(v) => setField("dateField", v)} hint="Campo Date" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="Campo de status"
                        value={mapping.statusField}
                        options={allPropNames}
                        onChange={(v) => setMapping((prev) => ({ ...prev, statusField: v, statusReadyValue: "", statusPublishedValue: "", statusErrorValue: "" }))}
                      />
                    </div>
                    {statusOptions.length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <SelectField label="Pronto para publicar" value={mapping.statusReadyValue} options={statusOptions} onChange={(v) => setField("statusReadyValue", v)} hint="Ex: Agendamento" />
                        <SelectField label="Publicado" value={mapping.statusPublishedValue} options={statusOptions} onChange={(v) => setField("statusPublishedValue", v)} hint="Ex: Publicado" />
                        <SelectField label="Erro" value={mapping.statusErrorValue} options={statusOptions} onChange={(v) => setField("statusErrorValue", v)} hint="Ex: Erro" />
                      </div>
                    )}
                  </div>

                  <Button onClick={handleSaveMapping} disabled={savingMapping} className="w-full">
                    {savingMapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Salvar mapeamento
                  </Button>
                </>
              )}
            </section>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    fetch("/api/notion/connection")
      .then((r) => r.json())
      .then((data) => {
        setConnections(data.connections ?? [])
        setLoading(false)
      })
  }, [])

  async function handleConnect() {
    setConnecting(true)
    const res = await fetch("/api/notion/auth-url")
    const { url } = await res.json()
    window.location.href = url
  }

  function handleDisconnect(id: string) {
    setConnections((prev) => prev.filter((c) => c.id !== id))
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-muted-foreground">Gerencie seus workspaces Notion e o mapeamento de campos</p>
        </div>
        <Button onClick={handleConnect} disabled={connecting}>
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {connections.length === 0 ? "Conectar Notion" : "Adicionar workspace"}
        </Button>
      </div>

      <div className="max-w-2xl space-y-4">
        {connections.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">Nenhum workspace conectado</h3>
              <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                Conecte seu workspace do Notion para começar a publicar automaticamente.
              </p>
              <Button onClick={handleConnect} disabled={connecting}>
                {connecting ? <Loader2 className="animate-spin" /> : <BookOpen />}
                Conectar Notion
              </Button>
            </CardContent>
          </Card>
        ) : (
          connections.map((connection) => (
            <WorkspaceCard
              key={connection.id}
              connection={connection}
              onDisconnect={handleDisconnect}
            />
          ))
        )}
      </div>
    </div>
  )
}
