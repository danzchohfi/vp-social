"use client"
import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BookOpen, Loader2, CheckCircle2, ChevronRight, Database, Sliders } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────

type NotionConnection = {
  workspaceName: string
  workspaceIcon?: string | null
  databaseId: string | null
  databaseName: string | null
}

type NotionDatabase = { id: string; name: string; lastEdited: string }

type NotionProperty = { name: string; type: string; options: string[] }

type FieldMapping = {
  titleField: string
  captionField: string
  hashtagsField: string
  tipoField: string
  plataformasField: string
  mediaVerticalField: string
  mediaHorizontalField: string
  mediaFeedField: string
  thumbnailField: string
  statusField: string
  statusReadyValue: string
  statusPublishedValue: string
  statusErrorValue: string
  dateField: string
  accountField: string
}

const DEFAULT_MAPPING: FieldMapping = {
  titleField: "Produção",
  captionField: "Legenda",
  hashtagsField: "Hashtags",
  tipoField: "Tipo",
  plataformasField: "Plataformas",
  mediaVerticalField: "Mídia Vertical",
  mediaHorizontalField: "Mídia Horizontal",
  mediaFeedField: "Imagens Feed",
  thumbnailField: "Thumbnail",
  statusField: "Status",
  statusReadyValue: "Agendamento",
  statusPublishedValue: "Publicado",
  statusErrorValue: "Erro",
  dateField: "Dia para fazer",
  accountField: "Conta",
}

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        done
          ? "bg-emerald-500 text-white"
          : active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground"
      )}
    >
      {done ? <CheckCircle2 className="h-4 w-4" /> : n}
    </div>
  )
}

// ─── SelectField helper ──────────────────────────────────────────────────────

function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Selecione…",
  hint,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)

  // step 1 – notion connection
  const [notion, setNotion] = useState<NotionConnection | null>(null)
  const [connecting, setConnecting] = useState(false)

  // step 2 – database selection
  const [databases, setDatabases] = useState<NotionDatabase[]>([])
  const [loadingDbs, setLoadingDbs] = useState(false)
  const [selectedDbId, setSelectedDbId] = useState<string>("")
  const [savingDb, setSavingDb] = useState(false)

  // step 3 – field mapping
  const [properties, setProperties] = useState<NotionProperty[]>([])
  const [loadingProps, setLoadingProps] = useState(false)
  const [mapping, setMapping] = useState<FieldMapping>(DEFAULT_MAPPING)
  const [savingMapping, setSavingMapping] = useState(false)

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch("/api/notion/connection").then((r) => r.json()),
      fetch("/api/settings/mapping").then((r) => r.json()),
    ]).then(([n, m]) => {
      setNotion(n.connection)
      if (n.connection?.databaseId) setSelectedDbId(n.connection.databaseId)
      if (m.mapping) setMapping({ ...DEFAULT_MAPPING, ...m.mapping })
      setLoading(false)
    })
  }, [])

  // ── Load databases when notion is connected ─────────────────────────────────

  const fetchDatabases = useCallback(async () => {
    setLoadingDbs(true)
    const res = await fetch("/api/notion/databases")
    const data = await res.json()
    setDatabases(data.databases ?? [])
    setLoadingDbs(false)
  }, [])

  useEffect(() => {
    if (notion) fetchDatabases()
  }, [notion, fetchDatabases])

  // ── Load properties when database is selected ───────────────────────────────

  const fetchProperties = useCallback(async (dbId: string) => {
    setLoadingProps(true)
    const res = await fetch(`/api/notion/databases/${dbId}/properties`)
    const data = await res.json()
    setProperties(data.properties ?? [])
    setLoadingProps(false)
  }, [])

  useEffect(() => {
    if (selectedDbId) fetchProperties(selectedDbId)
  }, [selectedDbId, fetchProperties])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleNotionConnect() {
    setConnecting(true)
    const res = await fetch("/api/notion/auth-url")
    const { url } = await res.json()
    window.location.href = url
  }

  async function handleSaveDatabase() {
    if (!selectedDbId) return
    setSavingDb(true)
    const db = databases.find((d) => d.id === selectedDbId)
    await fetch("/api/notion/connection", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ databaseId: selectedDbId, databaseName: db?.name ?? selectedDbId }),
    })
    setNotion((prev) => prev ? { ...prev, databaseId: selectedDbId, databaseName: db?.name ?? selectedDbId } : prev)
    toast.success("Banco de dados salvo!")
    setSavingDb(false)
  }

  async function handleSaveMapping() {
    setSavingMapping(true)
    await fetch("/api/settings/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapping),
    })
    toast.success("Mapeamento salvo!")
    setSavingMapping(false)
  }

  function setField(key: keyof FieldMapping, value: string) {
    setMapping((prev) => ({ ...prev, [key]: value }))
  }

  // ── Derived state ─────────────────────────────────────────────────────────────

  const allPropNames = properties.map((p) => p.name)
  const statusProp = properties.find((p) => p.name === mapping.statusField)
  const statusOptions = statusProp?.options ?? []

  const dbConfirmed = notion?.databaseId === selectedDbId && !!notion?.databaseId
  const step = !notion ? 1 : !dbConfirmed ? 2 : 3

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Configure a conexão com o Notion e o mapeamento de campos</p>
      </div>

      <div className="max-w-2xl space-y-4">

        {/* ── Step 1: Connect Notion ── */}
        <Card className={cn(step < 1 && "opacity-50")}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <StepBadge n={1} active={step === 1} done={step > 1} />
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="h-4 w-4" /> Conectar Notion
                </CardTitle>
                <CardDescription>Autorize o acesso ao seu workspace</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {notion ? (
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-3">
                  {notion.workspaceIcon && (
                    <img src={notion.workspaceIcon} alt="" className="h-8 w-8 rounded" />
                  )}
                  <div>
                    <p className="font-medium">{notion.workspaceName}</p>
                    <p className="text-xs text-muted-foreground">Workspace conectado</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleNotionConnect} disabled={connecting}>
                  Reconectar
                </Button>
              </div>
            ) : (
              <Button onClick={handleNotionConnect} disabled={connecting} className="w-full">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                Conectar Notion
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ── Step 2: Select Database ── */}
        <Card className={cn(!notion && "pointer-events-none opacity-40")}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <StepBadge n={2} active={step === 2} done={step > 2} />
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4" /> Selecionar banco de dados
                </CardTitle>
                <CardDescription>
                  {notion?.databaseName
                    ? `Banco atual: ${notion.databaseName}`
                    : "Escolha qual banco do Notion será usado"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          {notion && (
            <CardContent>
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
                          <SelectItem key={db.id} value={db.id}>
                            {db.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleSaveDatabase}
                    disabled={!selectedDbId || savingDb}
                    className="shrink-0"
                  >
                    {savingDb ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                    Confirmar
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* ── Step 3: Field Mapping ── */}
        <Card className={cn(!dbConfirmed && "pointer-events-none opacity-40")}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <StepBadge n={3} active={step === 3} done={false} />
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sliders className="h-4 w-4" /> Mapear campos
                </CardTitle>
                <CardDescription>Associe cada campo do sistema à coluna correspondente no Notion</CardDescription>
              </div>
            </div>
          </CardHeader>
          {dbConfirmed && (
            <CardContent className="space-y-6">
              {loadingProps ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Lendo propriedades do banco…
                </div>
              ) : (
                <>
                  {/* Identification */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Identificação
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="Título do post"
                        value={mapping.titleField}
                        options={allPropNames}
                        onChange={(v) => setField("titleField", v)}
                        hint="Propriedade title do Notion"
                      />
                      <SelectField
                        label="Conta / Cliente"
                        value={mapping.accountField}
                        options={allPropNames}
                        onChange={(v) => setField("accountField", v)}
                        hint="Deve bater com o nome da conta Instagram"
                      />
                    </div>
                  </section>

                  {/* Content */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Conteúdo
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="Legenda"
                        value={mapping.captionField}
                        options={allPropNames}
                        onChange={(v) => setField("captionField", v)}
                      />
                      <SelectField
                        label="Hashtags"
                        value={mapping.hashtagsField}
                        options={allPropNames}
                        onChange={(v) => setField("hashtagsField", v)}
                      />
                      <SelectField
                        label="Tipo de conteúdo"
                        value={mapping.tipoField}
                        options={allPropNames}
                        onChange={(v) => setField("tipoField", v)}
                        hint="Feed, Reel, Story, Carrossel…"
                      />
                      <SelectField
                        label="Plataformas"
                        value={mapping.plataformasField}
                        options={allPropNames}
                        onChange={(v) => setField("plataformasField", v)}
                        hint="Instagram, YouTube…"
                      />
                    </div>
                  </section>

                  {/* Media */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Mídias
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="Mídia Vertical (9:16)"
                        value={mapping.mediaVerticalField}
                        options={allPropNames}
                        onChange={(v) => setField("mediaVerticalField", v)}
                        hint="Reels, Stories, YouTube Shorts"
                      />
                      <SelectField
                        label="Imagens Feed (1:1 / 4:5)"
                        value={mapping.mediaFeedField}
                        options={allPropNames}
                        onChange={(v) => setField("mediaFeedField", v)}
                        hint="Feed e Carrossel"
                      />
                      <SelectField
                        label="Mídia Horizontal (16:9)"
                        value={mapping.mediaHorizontalField}
                        options={allPropNames}
                        onChange={(v) => setField("mediaHorizontalField", v)}
                        hint="YouTube"
                      />
                      <SelectField
                        label="Thumbnail"
                        value={mapping.thumbnailField}
                        options={allPropNames}
                        onChange={(v) => setField("thumbnailField", v)}
                        hint="Capa do Reel ou YouTube"
                      />
                    </div>
                  </section>

                  {/* Scheduling */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Agendamento
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="Data de publicação"
                        value={mapping.dateField}
                        options={allPropNames}
                        onChange={(v) => setField("dateField", v)}
                        hint="Campo Date — publica quando a data chegar"
                      />
                    </div>
                  </section>

                  {/* Status */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Status
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="Campo de status"
                        value={mapping.statusField}
                        options={allPropNames}
                        onChange={(v) => {
                          setField("statusField", v)
                          // reset status values when field changes
                          setMapping((prev) => ({ ...prev, statusField: v, statusReadyValue: "", statusPublishedValue: "", statusErrorValue: "" }))
                        }}
                        hint="Normalmente 'Status' no Notion"
                      />
                    </div>

                    {statusOptions.length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <SelectField
                          label="Pronto para publicar"
                          value={mapping.statusReadyValue}
                          options={statusOptions}
                          onChange={(v) => setField("statusReadyValue", v)}
                          hint="Ex: Agendamento"
                        />
                        <SelectField
                          label="Publicado"
                          value={mapping.statusPublishedValue}
                          options={statusOptions}
                          onChange={(v) => setField("statusPublishedValue", v)}
                          hint="Ex: Publicado"
                        />
                        <SelectField
                          label="Erro"
                          value={mapping.statusErrorValue}
                          options={statusOptions}
                          onChange={(v) => setField("statusErrorValue", v)}
                          hint="Ex: Erro"
                        />
                      </div>
                    )}
                  </section>

                  <Button onClick={handleSaveMapping} disabled={savingMapping} className="w-full">
                    {savingMapping ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Salvar mapeamento
                  </Button>
                </>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}
