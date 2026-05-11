"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSession } from "@/lib/auth-client"
import { toast } from "sonner"
import { ArrowRight, ListChecks, MessageCircle, Tag, UserCheck, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { RequiresSingleClient } from "@/components/dashboard/requires-single-client"

type Workspace = {
  id: string
  workspaceName: string
  workspaceIcon: string | null
  databaseId: string | null
  databaseName: string | null
}

type NotionDatabase = { id: string; name: string }
type PropInfo = { name: string; type: string; options: string[] }
type CloneSource = { id: string; workspaceName: string; databaseName: string | null; clientId: string | null; clientName: string | null }

type FieldMapping = {
  statusField: string; statusReadyValue: string; statusPublishedValue: string; statusErrorValue: string
  titleField: string
  dateField: string; captionField: string
  publicarEmField: string
  accountField: string
  feedImageUrlsField: string; verticalUrlsField: string; horizontalUrlsField: string; thumbnailUrlField: string
  likesField: string; commentsField: string; reachField: string; savesField: string; impressionsField: string
  postUrlField: string
  // Approval flow (opt-in). Empty string = not configured.
  awaitingApprovalValue: string; revisionRequestedValue: string
  // Optional: when set, the approval values above live in this Notion
  // property instead of `statusField`. Empty string = same field.
  approvalStatusField: string
  clientContactField: string; contactEmailField: string; contactPhoneField: string; contactApproverField: string
}

const DEFAULT_MAPPING: FieldMapping = {
  statusField: "Status", statusReadyValue: "Pronto", statusPublishedValue: "Publicado", statusErrorValue: "Erro",
  titleField: "Produção",
  dateField: "Data", captionField: "Legenda",
  publicarEmField: "Publicar em",
  accountField: "Conta",
  feedImageUrlsField: "Imagens Feed", verticalUrlsField: "Mídia Vertical", horizontalUrlsField: "Mídia Horizontal", thumbnailUrlField: "Thumbnail",
  likesField: "", commentsField: "", reachField: "", savesField: "", impressionsField: "",
  postUrlField: "",
  awaitingApprovalValue: "", revisionRequestedValue: "", approvalStatusField: "",
  clientContactField: "", contactEmailField: "", contactPhoneField: "", contactApproverField: "",
}

const NONE_VALUE = "__none__"

function SelectField({ label, value, options, onChange, hint }: { label: string; value: string; options: string[]; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-base">{label}</Label>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
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
        <Label className="text-base">{label}</Label>
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder="Selecione um campo de Status acima" disabled />
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <Label className="text-base">{label}</Label>
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

function ClientConfigCard({
  clientId,
  panel,
  icon,
  label,
  description,
}: {
  clientId: string
  panel: "setup" | "approval" | "contas" | "members"
  icon: React.ReactNode
  label: string
  description: string
}) {
  return (
    <Link
      href={`/clients?focus=${encodeURIComponent(clientId)}&panel=${panel}`}
      className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
    >
      <div className="text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium">{label}</p>
        <p className="text-[13px] text-muted-foreground truncate">{description}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />
    </Link>
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
  // Active client — used by the per-client config shortcuts at the top.
  // Fetched once on mount; refreshed when the user switches client.
  const [activeClient, setActiveClient] = useState<{ id: string; name: string; logoUrl: string | null } | null>(null)
  const [dbUrl, setDbUrl] = useState("")
  const [dbName, setDbName] = useState<string | null>(null)
  const [props, setProps] = useState<PropInfo[]>([])
  const [mapping, setMapping] = useState<FieldMapping>(DEFAULT_MAPPING)
  const [saving, setSaving] = useState(false)
  const [loadingDb, setLoadingDb] = useState(false)
  const [databases, setDatabases] = useState<NotionDatabase[]>([])
  const [selectedDbId, setSelectedDbId] = useState("")
  const [loadingDbs, setLoadingDbs] = useState(false)
  const [cloneSources, setCloneSources] = useState<CloneSource[]>([])
  const [cloneFromId, setCloneFromId] = useState("")
  const [cloning, setCloning] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<Array<{ id: string; label: string; status: "ok" | "warn" | "error"; message: string; details?: string }> | null>(null)

  useEffect(() => {
    fetch("/api/notion/workspaces").then(r => r.json()).then((data: Workspace[]) => {
      setWorkspaces(data)
      if (!data.length) return
      const stored = typeof window !== "undefined" ? localStorage.getItem("vpsocial_selected_workspace") : null
      const valid = stored && data.find(w => w.id === stored)
      setSelectedId(valid ? stored : data[0].id)
    })
    fetch("/api/clients").then(r => r.json()).then((data) => {
      const list: Array<{ id: string; name: string; logoUrl: string | null }> = data?.clients ?? []
      const id = typeof data?.activeClientId === "string" ? data.activeClientId : ""
      const found = list.find((c) => c.id === id) ?? list[0] ?? null
      setActiveClient(found)
    }).catch(() => {})
  }, [])

  const selected = workspaces.find(w => w.id === selectedId)

  useEffect(() => {
    if (!selectedId) return
    fetch(`/api/notion/workspaces/${selectedId}/mapping`).then(r => r.json()).then((data) => {
      setMapping({ ...DEFAULT_MAPPING, ...data })
    })
    fetch(`/api/notion/workspaces/clonable?excludeConnectionId=${selectedId}`)
      .then(r => r.json())
      .then((data) => setCloneSources(Array.isArray(data) ? data : []))
      .catch(() => setCloneSources([]))
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

  // Force-refresh the props list from Notion (used by the "Recarregar"
  // button next to the Relation picker). Without this, props in component
  // state are stale if the user added a new column in Notion after the
  // page loaded.
  const [reloadingProps, setReloadingProps] = useState(false)
  async function reloadProps() {
    if (!selectedId || !selected?.databaseId) return
    setReloadingProps(true)
    try {
      const res = await fetch(`/api/notion/workspaces/${selectedId}/props`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error ?? "Erro ao recarregar propriedades")
        return
      }
      setProps(normalizeProps(data))
      toast.success(`${Array.isArray(data) ? data.length : 0} propriedades carregadas do Notion`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setReloadingProps(false)
    }
  }

  const propNames = props.length
    ? props.map(p => p.name)
    : [mapping.statusField, mapping.dateField, mapping.captionField, mapping.publicarEmField, mapping.accountField, mapping.feedImageUrlsField, mapping.verticalUrlsField, mapping.horizontalUrlsField, mapping.thumbnailUrlField].filter(Boolean)

  const selectPropNames = props.length
    ? props.filter(p => p.type === "select" || p.type === "status").map(p => p.name)
    : [mapping.statusField].filter(Boolean)

  // Notion enforces exactly one Title-type property per database; filter to it
  // so the dropdown can't be misconfigured to a non-title field (which would
  // make YouTube uploads error out with empty title).
  const titlePropNames = props.length
    ? props.filter(p => p.type === "title").map(p => p.name)
    : [mapping.titleField].filter(Boolean)

  // Analytics fields are written as numeric metrics by the sync job, so the
  // dropdowns only offer Number-type properties. Falls back to the current
  // saved value so an existing mapping isn't lost if the user reopens the
  // form before props load.
  const numberPropNames = props.length
    ? props.filter(p => p.type === "number").map(p => p.name)
    : [mapping.likesField, mapping.commentsField, mapping.reachField, mapping.savesField, mapping.impressionsField].filter(Boolean)

  // Approval-contact column on the post DB. A Relation property is the
  // ideal case (cron walks the relation → Contato page → phone). A Rollup
  // also works if it aggregates an underlying Relation — resolveContact
  // follows the rollup's relation_property_name from the DB schema down
  // to the actual relation. Both types appear in the picker.
  const relationPropNames = props.length
    ? props.filter(p => p.type === "relation" || p.type === "rollup").map(p => p.name)
    : [mapping.clientContactField].filter(Boolean)

  const statusOptions = props.find(p => p.name === mapping.statusField)?.options ?? []
  // Approval flow can live in a different Notion property than the publish
  // status (e.g. "Status produção" vs "Status agendamento"). When the
  // override is set, options come from THAT property; otherwise we reuse
  // the publish-status options so legacy workspaces don't have to set it.
  const approvalStatusField = mapping.approvalStatusField?.trim() || mapping.statusField
  const approvalStatusOptions = props.find(p => p.name === approvalStatusField)?.options ?? statusOptions

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

  async function reauthNotion() {
    const res = await fetch("/api/notion/auth-url?from=settings")
    const { url } = await res.json()
    window.location.href = url
  }

  // Auto-detect: ask the server to walk the Notion DB schema and suggest
  // values for as many fields as it can. Merges the suggestion into the
  // current mapping (only fills empty fields by default — won't clobber
  // a value the user already chose). User then reviews + clicks Salvar.
  const [detecting, setDetecting] = useState(false)
  const [detectSummary, setDetectSummary] = useState<{ filled: number; total: number; lowConfidence: string[] } | null>(null)
  async function autoDetect() {
    if (!selectedId || !selected?.databaseId) {
      toast.error("Conecte um banco de dados antes")
      return
    }
    setDetecting(true)
    setDetectSummary(null)
    try {
      const res = await fetch(`/api/notion/workspaces/${selectedId}/auto-detect`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao detectar campos")
        return
      }
      const suggested: Partial<FieldMapping> = data.suggested ?? {}
      const confidence: Record<string, "high" | "medium" | "low"> = data.confidence ?? {}
      let filled = 0
      const lowConfidence: string[] = []
      // Apply: only fill empty fields. Track which we filled + which had
      // low confidence so the user knows what to double-check.
      setMapping((prev) => {
        const next = { ...prev }
        for (const [k, v] of Object.entries(suggested)) {
          if (typeof v !== "string" || !v) continue
          const key = k as keyof FieldMapping
          const cur = (next as any)[key]
          if (cur && typeof cur === "string" && cur.trim()) continue
          ;(next as any)[key] = v
          filled++
          if (confidence[k] === "low") lowConfidence.push(k)
        }
        return next
      })
      const total = Object.keys(suggested).length
      setDetectSummary({ filled, total, lowConfidence })
      if (filled === 0) {
        toast.info("Nada novo a preencher — todos os campos já estavam definidos")
      } else {
        toast.success(`${filled} campo(s) preenchidos automaticamente. Revise e clique em Salvar.`)
      }
    } finally {
      setDetecting(false)
    }
  }

  async function cloneFrom() {
    if (!selectedId || !cloneFromId) return
    setCloning(true)
    try {
      const res = await fetch(`/api/notion/workspaces/${selectedId}/mapping/clone-from`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceConnectionId: cloneFromId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Erro ao copiar"); return }
      // Reload the mapping so the form reflects the cloned values immediately.
      const fresh = await fetch(`/api/notion/workspaces/${selectedId}/mapping`).then(r => r.json())
      setMapping({ ...DEFAULT_MAPPING, ...fresh })
      setCloneFromId("")
      toast.success("Configuração copiada! Confira e clique em Salvar.")
    } finally {
      setCloning(false)
    }
  }

  async function runTest() {
    setTesting(true)
    setTestResults(null)
    try {
      const res = await fetch("/api/settings/test-config")
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao testar")
        return
      }
      setTestResults(data.checks ?? [])
    } finally {
      setTesting(false)
    }
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
      <RequiresSingleClient message="Configurações são por cliente. Selecione um cliente específico no menu lateral antes de mexer em conexões ou mapeamento." />
      <div>
        <h1 className="text-3xl tracking-tight sm:text-4xl">Configurações</h1>
        <p className="text-muted-foreground mt-1">Configure seus workspaces do Notion e o mapeamento de campos.</p>
      </div>

      {/* Per-client configuration shortcuts. Each card jumps to the
          right panel in /clients with the panel already expanded — so
          configs that used to be buried 3-4 clicks deep are reachable
          in one. Full inline rendering is planned for a follow-up. */}
      {activeClient && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">
              Configurações de <span className="text-foreground">{activeClient.name}</span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Atalhos pras configurações que vivem em <Link href="/clients" className="underline">Gerenciar clientes</Link>. Cada um abre o painel certo já expandido.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ClientConfigCard
              clientId={activeClient.id}
              panel="setup"
              icon={<ListChecks className="h-4 w-4" />}
              label="Status de configuração"
              description="Checklist do que falta pra publicar + botão de pausar publicações"
            />
            <ClientConfigCard
              clientId={activeClient.id}
              panel="approval"
              icon={<MessageCircle className="h-4 w-4" />}
              label="Aprovação cliente (ManyChat / WhatsApp)"
              description="API key ManyChat, Flow, template wa.me, link calendário"
            />
            <ClientConfigCard
              clientId={activeClient.id}
              panel="contas"
              icon={<Tag className="h-4 w-4" />}
              label="Contas do Notion mapeadas"
              description="Quais valores do campo Conta pertencem a este cliente"
            />
            <ClientConfigCard
              clientId={activeClient.id}
              panel="members"
              icon={<Users className="h-4 w-4" />}
              label="Membros e convites"
              description="Quem mais pode acessar este cliente"
            />
            <Link
              href="/approvers"
              className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
            >
              <div className="text-muted-foreground"><UserCheck className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium">Aprovadores</p>
                <p className="text-[13px] text-muted-foreground truncate">
                  Cadastro reutilizável de aprovadores (Magic Link, chain de produção)
                </p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            </Link>
          </div>
        </section>
      )}

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
          <p className="text-base text-muted-foreground">Nenhum workspace conectado. <a href="/onboarding" className="underline">Conectar Notion</a></p>
        )}
      </div>

      {selectedId && (
        <>
          <div className="space-y-3">
            <Label>Banco de dados do Notion</Label>
            {dbName ? (
              <div className="flex items-center gap-2">
                <span className="text-base font-medium text-green-600">✓ {dbName}</span>
                <Button variant="outline" size="sm" onClick={() => { setDbName(null); setDbUrl(""); setSelectedDbId("") }}>Trocar</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {loadingDbs ? (
                  <p className="text-base text-muted-foreground">Carregando bancos com acesso…</p>
                ) : databases.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label className="text-base">Bancos com acesso da integração</Label>
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
                  <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
                    <div className="space-y-1">
                      <p className="text-base font-medium">Nenhuma página acessível para este cliente.</p>
                      <p className="text-sm text-muted-foreground">
                        Cada cliente tem sua própria autorização do Notion. Páginas compartilhadas com outros clientes não vêm junto automaticamente. Você tem 2 caminhos:
                      </p>
                    </div>
                    <div className="space-y-2 rounded border bg-background/50 p-3 text-sm">
                      <p className="font-semibold">Opção 1 — No Notion, adicione esta integração ao banco</p>
                      <ol className="list-decimal space-y-0.5 pl-4 text-muted-foreground">
                        <li>Abra o banco/página no Notion</li>
                        <li>Clique em <strong>⋯</strong> (canto superior direito) → <strong>Conexões</strong></li>
                        <li>Procure pela integração e clique em <strong>Adicionar</strong></li>
                        <li>Volte aqui e cole a URL do banco abaixo</li>
                      </ol>
                    </div>
                    <div className="space-y-2 rounded border bg-background/50 p-3 text-sm">
                      <p className="font-semibold">Opção 2 — Reabrir autorização e marcar a página</p>
                      <p className="text-muted-foreground">Na tela do Notion, marque o checkbox da página antes de confirmar.</p>
                      <Button onClick={reauthNotion} variant="outline" size="sm" className="w-full">
                        Reabrir autorização do Notion
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-base">{databases.length > 0 ? "Ou cole a URL do banco" : "URL do banco"}</Label>
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
                  <p className="text-sm text-muted-foreground">
                    Abra o banco no Notion, clique em ⋯ → Copiar link e cole aqui.
                  </p>
                </div>
              </div>
            )}
          </div>

          {dbName && (
            <div className="space-y-6">
              {cloneSources.length > 0 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <p className="text-base font-semibold">Copiar de outro workspace</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Replica o mapeamento (status, campos, analytics) de um cliente já configurado. Útil pra clientes que usam um banco do Notion com a mesma estrutura.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Select value={cloneFromId} onValueChange={setCloneFromId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Escolha um workspace de origem..." />
                      </SelectTrigger>
                      <SelectContent>
                        {cloneSources.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.clientName ? `${s.clientName} · ` : ""}{s.workspaceName}
                            {s.databaseName ? ` (${s.databaseName})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={cloneFrom} disabled={!cloneFromId || cloning} variant="outline">
                      {cloning ? "Copiando..." : "Aplicar configuração"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Auto-detect banner — gives the user a one-click way to
                  fill in 80% of the mapping based on the DB's actual
                  schema. They still review + Save. */}
              {selected?.databaseId && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium">Preencher automaticamente</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Análise as propriedades do seu banco de dados e sugere valores pra todos os campos abaixo (status, datas, mídia, contato pra aprovação). Você revisa antes de salvar.
                      </p>
                      {detectSummary && (
                        <p className="mt-1.5 text-sm text-success">
                          {detectSummary.filled} campo(s) preenchidos.
                          {detectSummary.lowConfidence.length > 0 && (
                            <span className="text-warning">
                              {" "}Revise com atenção: {detectSummary.lowConfidence.slice(0, 4).join(", ")}{detectSummary.lowConfidence.length > 4 ? "…" : ""}.
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <Button onClick={autoDetect} disabled={detecting} size="sm">
                      {detecting ? "Analisando..." : "Detectar"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Status de Publicação</p>
                <p className="text-sm text-muted-foreground">
                  Recomendamos um campo de Publicação separado do seu Status editorial. O Status fica para o workflow da equipe (ideia / em produção / concluído); a Publicação fica para o sistema (agendado / publicado / erro). Assim o app nunca sobrescreve o estado editorial.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Campo de status de publicação" value={mapping.statusField} options={selectPropNames} onChange={(v) => setField("statusField", v)} hint="Apenas campos do tipo Select aparecem aqui" />
                  <StatusValueSelect label='Valor "Pronto para publicar"' value={mapping.statusReadyValue} options={statusOptions} onChange={(v) => setField("statusReadyValue", v)} />
                  <StatusValueSelect label='Valor "Publicado"' value={mapping.statusPublishedValue} options={statusOptions} onChange={(v) => setField("statusPublishedValue", v)} />
                  <StatusValueSelect label='Valor "Erro"' value={mapping.statusErrorValue} options={statusOptions} onChange={(v) => setField("statusErrorValue", v)} />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Agendamento</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Título" value={mapping.titleField} options={titlePropNames} onChange={(v) => setField("titleField", v)} hint="Propriedade Title do Notion. Usado como título do vídeo no YouTube." />
                  <SelectField label="Data de publicação" value={mapping.dateField} options={propNames} onChange={(v) => setField("dateField", v)} />
                  <SelectField label="Conta" value={mapping.accountField} options={propNames} onChange={(v) => setField("accountField", v)} hint="Deve bater com o nome da conta no app" />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conteúdo</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Legenda" value={mapping.captionField} options={propNames} onChange={(v) => setField("captionField", v)} hint="Inclua hashtags direto na legenda" />
                  <SelectField label="Publicar em" value={mapping.publicarEmField} options={propNames} onChange={(v) => setField("publicarEmField", v)} hint="Multi-select: Instagram Reels, YouTube Shorts, TikTok…" />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Mídia</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Imagens Feed" value={mapping.feedImageUrlsField} options={propNames} onChange={(v) => setField("feedImageUrlsField", v)} />
                  <SelectField label="Mídia Vertical" value={mapping.verticalUrlsField} options={propNames} onChange={(v) => setField("verticalUrlsField", v)} hint="Stories, Reels" />
                  <SelectField label="Mídia Horizontal" value={mapping.horizontalUrlsField} options={propNames} onChange={(v) => setField("horizontalUrlsField", v)} />
                  <SelectField label="Thumbnail" value={mapping.thumbnailUrlField} options={propNames} onChange={(v) => setField("thumbnailUrlField", v)} />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pós-publicação</p>
                <p className="text-sm text-muted-foreground">Crie uma propriedade do tipo <strong>Texto</strong> no Notion e mapeie aqui. Após publicar, vamos escrever um link clicável por plataforma (ex.: &quot;Instagram: https://...&quot;) — assim você não perde os links anteriores quando publicar em várias plataformas.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Links publicados" value={mapping.postUrlField} options={propNames} onChange={(v) => setField("postUrlField", v)} />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Aprovação do cliente (opcional)</p>
                <p className="text-sm text-muted-foreground">
                  Dispara um link de aprovação por WhatsApp toda vez que um post entra no status &quot;aguardando aprovação&quot;. O cliente abre <code className="rounded bg-muted px-1 font-mono text-[13px]">/approve/&lt;token&gt;</code> e decide aprovar ou pedir alterações. Para ativar, preencha os 5 campos abaixo + o ManyChat do cliente em <a href="/clients" className="underline">/clients</a>.
                </p>
                <SelectField
                  label="Campo de status de aprovação (opcional)"
                  value={mapping.approvalStatusField}
                  options={["", ...selectPropNames]}
                  onChange={(v) => setField("approvalStatusField", v)}
                  hint={`Deixe em branco para usar o mesmo campo de status de publicação (${mapping.statusField}). Marque outro Select/Status quando o fluxo de aprovação vive numa propriedade separada (ex.: "Status produção").`}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatusValueSelect label="Status que dispara aprovação" value={mapping.awaitingApprovalValue} options={approvalStatusOptions} onChange={(v) => setField("awaitingApprovalValue", v)} />
                  <StatusValueSelect label='Status quando "pedir alterações"' value={mapping.revisionRequestedValue} options={approvalStatusOptions} onChange={(v) => setField("revisionRequestedValue", v)} />
                </div>
                <p className="text-sm text-muted-foreground">
                  Para descobrir o contato, criamos uma <strong>relação</strong> no post apontando para a sua DB de <strong>Contato</strong> (com colunas para email e WhatsApp). O app segue a relação e lê os campos lá. Os nomes das colunas variam por workspace — preencha exatamente como aparecem no seu Notion.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <SelectField
                      label="Coluna de relação Contato (no post)"
                      value={mapping.clientContactField}
                      options={relationPropNames}
                      onChange={(v) => setField("clientContactField", v)}
                      hint={
                        relationPropNames.length === 0
                          ? `Nenhuma propriedade tipo Relation ou Rollup foi detectada no DB conectado${dbName ? ` (${dbName})` : ""}. Se você acabou de criar uma no Notion, clique em "Recarregar propriedades" abaixo. Caso contrário, abra a tabela do Notion → Add property → escolha "Relation" → aponte pra sua DB de Contatos.`
                          : `Propriedades tipo Relation ou Rollup aparecem aqui (${relationPropNames.length} encontrada${relationPropNames.length === 1 ? "" : "s"}). Rollup funciona se ele agrega uma Relation pra DB de Contatos.`
                      }
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={reloadProps}
                        disabled={reloadingProps || !selected?.databaseId}
                        type="button"
                      >
                        {reloadingProps ? "Recarregando…" : "Recarregar propriedades do Notion"}
                      </Button>
                      <span className="text-[13px] text-muted-foreground">
                        Use quando você acabou de criar/renomear uma propriedade no Notion.
                      </span>
                    </div>
                    {props.length > 0 && (
                      <details className="rounded-md border bg-muted/30 p-2 text-sm">
                        <summary className="cursor-pointer font-medium text-muted-foreground">
                          Diagnóstico: ver todas as {props.length} propriedades detectadas
                        </summary>
                        <div className="mt-2 space-y-1">
                          <p className="text-[13px] text-muted-foreground">
                            Lista completa do que o Notion API retornou pro DB conectado. Se a propriedade que você procura não aparece aqui, ela não existe no DB conectado (ou a integração Notion não tem acesso). Se aparece com tipo diferente de <code className="rounded bg-muted px-1 font-mono">relation</code>, esse é o motivo — recrie como Relation no Notion.
                          </p>
                          <ul className="mt-1.5 space-y-0.5 font-mono text-[13px]">
                            {[...props]
                              .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
                              .map((p) => (
                                <li
                                  key={p.name}
                                  className={cn(
                                    "flex items-center gap-2",
                                    (p.type === "relation" || p.type === "rollup") && "text-success font-semibold",
                                  )}
                                >
                                  <span className="inline-block w-24 shrink-0 text-muted-foreground">{p.type}</span>
                                  <span className="truncate">{p.name}</span>
                                </li>
                              ))}
                          </ul>
                          <p className="mt-2 text-[13px] text-muted-foreground">
                            Tipos detectados:{" "}
                            {Object.entries(
                              props.reduce<Record<string, number>>((acc, p) => {
                                acc[p.type] = (acc[p.type] ?? 0) + 1
                                return acc
                              }, {}),
                            )
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([t, n]) => `${n} ${t}`)
                              .join(", ")}
                          </p>
                        </div>
                      </details>
                    )}
                  </div>
                  <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm">
                    <p className="font-medium text-success">Telefone do contato — automático</p>
                    <p className="mt-1 text-foreground/80">
                      O app detecta automaticamente qualquer propriedade do tipo <code className="rounded bg-muted px-1 font-mono text-[12px]">Phone</code> na sua DB de Contato (ex.: &quot;Celular / WhatsApp&quot;). Valor com DDI: <code className="rounded bg-muted px-1 font-mono text-[12px]">+5511999999999</code>.
                      Se não houver uma coluna tipo Phone, ele tenta fallback por nome (qualquer coluna com &quot;WhatsApp&quot;, &quot;Telefone&quot;, &quot;Celular&quot;).
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-base">Coluna &quot;Aprovador?&quot; (na DB Contato) — opcional</Label>
                    <p className="text-sm text-muted-foreground">
                      Nome exato de uma propriedade <strong>Checkbox</strong> na DB de Contato (ex.: &quot;Aprovador&quot;, &quot;Responsável aprovação&quot;).
                      Use quando o post linka múltiplos contatos e só um deles deve receber o WhatsApp.
                      Deixe vazio = usa o primeiro contato linkado.
                    </p>
                    <Input
                      placeholder="Aprovador"
                      value={mapping.contactApproverField}
                      onChange={(e) => setField("contactApproverField", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Analytics (opcional)</p>
                <p className="text-sm text-muted-foreground">Crie campos Number no Notion e mapeie aqui para sincronizar métricas automaticamente.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Curtidas" value={mapping.likesField} options={numberPropNames} onChange={(v) => setField("likesField", v)} />
                  <SelectField label="Comentários" value={mapping.commentsField} options={numberPropNames} onChange={(v) => setField("commentsField", v)} />
                  <SelectField label="Alcance" value={mapping.reachField} options={numberPropNames} onChange={(v) => setField("reachField", v)} />
                  <SelectField label="Salvamentos" value={mapping.savesField} options={numberPropNames} onChange={(v) => setField("savesField", v)} />
                  <SelectField label="Impressões" value={mapping.impressionsField} options={numberPropNames} onChange={(v) => setField("impressionsField", v)} />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-muted-foreground/20 bg-muted/20 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold">Testar configuração</p>
                    <p className="text-sm text-muted-foreground">
                      Faz um dry-run: valida tokens, acessos, mapeamento e contas sociais antes de você agendar.
                    </p>
                  </div>
                  <Button onClick={runTest} disabled={testing} variant="outline" size="sm">
                    {testing ? "Testando..." : "Rodar teste"}
                  </Button>
                </div>
                {testResults && (
                  <div className="space-y-1.5">
                    {testResults.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nada a testar.</p>
                    )}
                    {testResults.map((r) => {
                      const color =
                        r.status === "ok"
                          ? "border-success/30 bg-success/5 text-success"
                          : r.status === "warn"
                            ? "border-warning/30 bg-warning/5 text-warning"
                            : "border-destructive/30 bg-destructive/5 text-destructive"
                      const icon = r.status === "ok" ? "✓" : r.status === "warn" ? "⚠" : "✗"
                      return (
                        <div key={r.id} className={`rounded border px-3 py-2 text-sm ${color}`}>
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono font-bold">{icon}</span>
                            <span className="font-medium text-foreground">{r.label}</span>
                            <span className="ml-auto text-[13px] uppercase tracking-wider opacity-70">{r.status}</span>
                          </div>
                          <p className="mt-0.5 text-foreground/80">{r.message}</p>
                          {r.details && (
                            <p className="mt-1 break-all font-mono text-[12px] opacity-70">{r.details}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
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
