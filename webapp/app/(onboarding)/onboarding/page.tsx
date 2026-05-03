"use client"
import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  BookOpen, Instagram, CheckCircle2, Loader2, ExternalLink,
  ArrowRight, Database, Zap, Building2, Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Step = 0 | 1 | 2 | 3 | 4 | 5

type Connection = {
  id: string
  workspaceName: string
  workspaceIcon?: string | null
  databaseId: string | null
  databaseName?: string | null
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
  statusField: "Status", statusReadyValue: "Agendamento", statusPublishedValue: "Publicado", statusErrorValue: "Erro",
  dateField: "Dia para fazer", captionField: "Legenda",
  publicarEmField: "Publicar em",
  accountField: "Conta",
  feedImageUrlsField: "Imagens Feed", verticalUrlsField: "Mídia Vertical", horizontalUrlsField: "Mídia Horizontal", thumbnailUrlField: "Thumbnail",
  likesField: "", commentsField: "", reachField: "", savesField: "", impressionsField: "",
}

const NONE_VALUE = "__none__"

const STEPS = [
  { num: 0, label: "Cliente" },
  { num: 1, label: "Notion" },
  { num: 2, label: "Banco" },
  { num: 3, label: "Contas" },
  { num: 4, label: "Mapeamento" },
  { num: 5, label: "Pronto!" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const wasCloned = searchParams.get("cloned") === "1"

  const [step, setStep] = useState<Step>(0)
  const [loading, setLoading] = useState(false)

  const [clientId, setClientId] = useState<string | null>(null)
  const [clientName, setClientName] = useState("")
  const [clientLogo, setClientLogo] = useState("")
  const [savingClient, setSavingClient] = useState(false)

  const [connection, setConnection] = useState<Connection | null>(null)

  const [databases, setDatabases] = useState<NotionDatabase[]>([])
  const [selectedDbId, setSelectedDbId] = useState("")
  const [manualUrl, setManualUrl] = useState("")
  const [dbLoading, setDbLoading] = useState(false)
  const [dbSaving, setDbSaving] = useState(false)

  type PendingAccount = { id: string; platform: string; pageName: string; conta: string }
  const [pendingAccounts, setPendingAccounts] = useState<PendingAccount[] | null>(null)
  const [keptAccountIds, setKeptAccountIds] = useState<Set<string>>(new Set())
  const [confirmingPending, setConfirmingPending] = useState(false)

  const loadConnection = useCallback(async () => {
    setLoading(true)
    try {
      const clientsRes = await fetch("/api/clients")
      const clientsData = await clientsRes.json()
      const activeClient = (clientsData.clients ?? []).find((c: any) => c.id === clientsData.activeClientId)
      const isDefaultName = activeClient?.name === "Cliente padrão"
      setClientId(activeClient?.id ?? null)
      setClientName(isDefaultName ? "" : activeClient?.name ?? "")
      setClientLogo(activeClient?.logoUrl ?? "")

      const res = await fetch("/api/notion/connection")
      const data = await res.json()
      const list: Connection[] = data.connections ?? []

      if (list.length > 0) {
        const conn = list[0]
        setConnection(conn)
        if (conn.databaseId) {
          setStep(3)
        } else {
          setStep(2)
          loadDatabases(conn.id)
        }
      } else {
        setStep(isDefaultName ? 0 : 1)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const igConnected = searchParams.get("instagram_connected")
    const error = searchParams.get("error")

    if (error) {
      const message =
        error === "cancelled"
          ? "Conexão cancelada — você fechou a janela do Notion ou Facebook."
          : error === "no_pages"
          ? "Nenhuma página encontrada no Facebook. Verifique se você tem páginas administradas."
          : "Erro ao conectar. Tente de novo."
      toast.error(message)
      loadConnection()
      return
    }

    if (igConnected === "true") {
      ;(async () => {
        try {
          const [clientsRes, connRes, pendingRes] = await Promise.all([
            fetch("/api/clients").then((r) => r.json()),
            fetch("/api/notion/connection").then((r) => r.json()),
            fetch("/api/accounts/pending").then((r) => r.json()),
          ])
          const activeClient = (clientsRes.clients ?? []).find((c: any) => c.id === clientsRes.activeClientId)
          setClientId(activeClient?.id ?? null)
          setClientName(activeClient?.name === "Cliente padrão" ? "" : activeClient?.name ?? "")
          setClientLogo(activeClient?.logoUrl ?? "")
          const list: Connection[] = connRes.connections ?? []
          if (list.length > 0) setConnection(list[0])

          const pending: PendingAccount[] = pendingRes.accounts ?? []
          if (pending.length > 0) {
            setPendingAccounts(pending)
            setKeptAccountIds(new Set())
            setStep(3)
          } else {
            setStep(4)
          }
        } finally {
          setLoading(false)
        }
      })()
      return
    }

    loadConnection()
  }, [searchParams, loadConnection])

  const saveClient = async () => {
    if (!clientName.trim()) return
    setSavingClient(true)
    try {
      if (clientId) {
        const res = await fetch(`/api/clients/${clientId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: clientName.trim(), logoUrl: clientLogo.trim() || null }),
        })
        if (!res.ok) {
          toast.error("Erro ao salvar cliente")
          return
        }
      } else {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: clientName.trim(), logoUrl: clientLogo.trim() || null }),
        })
        const data = await res.json()
        if (!res.ok || !data.client?.id) {
          toast.error(data.error ?? "Erro ao criar cliente")
          return
        }
        await fetch("/api/clients/active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: data.client.id }),
        })
        setClientId(data.client.id)
      }
      setStep(1)
    } finally {
      setSavingClient(false)
    }
  }

  const loadDatabases = useCallback(async (connectionId: string) => {
    setDbLoading(true)
    try {
      const res = await fetch(`/api/notion/databases?connectionId=${connectionId}`)
      const data = await res.json()
      setDatabases(data.databases ?? [])
    } finally {
      setDbLoading(false)
    }
  }, [])

  function extractNotionId(input: string): string {
    const match = input.match(/([a-f0-9]{32})/i)
    if (match) {
      const raw = match[1]
      return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`
    }
    return input.trim()
  }

  const effectiveDbId = selectedDbId || (manualUrl ? extractNotionId(manualUrl) : "")

  const saveDatabase = async () => {
    if (!connection || !effectiveDbId) return
    setDbSaving(true)
    try {
      const res = await fetch(`/api/notion/workspaces/${connection.id}/database`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: effectiveDbId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(
          "O bot deste cliente não tem acesso a este banco. Compartilhe o banco com a integração no Notion (abra o banco → ⋯ → Conexões → adicionar) ou reabra a autorização e marque a página."
        )
        return
      }
      setStep(3)
    } finally {
      setDbSaving(false)
    }
  }

  const connectNotion = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/notion/auth-url?from=onboarding")
      const { url } = await res.json()
      window.location.href = url
    } catch {
      setLoading(false)
    }
  }

  const connectInstagram = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/facebook/auth-url?from=onboarding")
      const { url } = await res.json()
      window.location.href = url
    } catch {
      setLoading(false)
    }
  }

  const togglePending = (id: string) => {
    setKeptAccountIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const confirmPending = async () => {
    setConfirmingPending(true)
    try {
      const res = await fetch("/api/accounts/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep: Array.from(keptAccountIds) }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao confirmar páginas")
        return
      }
      toast.success(
        `${data.activated ?? 0} ativada(s)${data.deleted ? `, ${data.deleted} removida(s)` : ""}.`
      )
      setPendingAccounts(null)
      setStep(4)
    } finally {
      setConfirmingPending(false)
    }
  }

  const finish = () => router.push("/dashboard")

  return (
    <div className="w-full max-w-lg space-y-8">
      <div className="flex items-center justify-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  step > s.num
                    ? "bg-primary text-primary-foreground"
                    : step === s.num
                    ? "border-2 border-primary bg-background text-primary"
                    : "border-2 border-muted bg-background text-muted-foreground"
                )}
              >
                {step > s.num ? <CheckCircle2 className="h-4 w-4" /> : s.num}
              </div>
              <span className={cn("text-[10px] sm:text-xs", step === s.num ? "font-medium text-foreground" : "text-muted-foreground")}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={cn("mx-1 sm:mx-2 mb-5 h-0.5 w-6 sm:w-10 transition-colors", step > s.num ? "bg-primary" : "bg-muted")} />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <StepCard icon={<Building2 className="h-6 w-6 text-primary" />} title="Seu primeiro cliente" description="Cada cliente tem seu próprio Notion, contas sociais e histórico isolados. Comece dando um nome.">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome do cliente</Label>
              <Input autoFocus value={clientName} onChange={(e) => setClientName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveClient() }} placeholder="Ex: Vitamina Publicitária, Naydacury…" />
            </div>
            <div className="space-y-1.5">
              <Label>Logo (URL opcional)</Label>
              <Input value={clientLogo} onChange={(e) => setClientLogo(e.target.value)} placeholder="https://exemplo.com/logo.png" />
            </div>
            <Button onClick={saveClient} disabled={savingClient || !clientName.trim()} className="w-full" size="lg">
              {savingClient ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              Continuar
            </Button>
            <p className="text-center text-xs text-muted-foreground">Você pode adicionar mais clientes depois em &quot;Clientes&quot;.</p>
          </div>
        </StepCard>
      )}

      {step === 1 && (
        <StepCard icon={<BookOpen className="h-6 w-6 text-primary" />} title="Conectar ao Notion" description="Autorize o VP Social a acessar seus workspaces no Notion para buscar seus posts agendados.">
          <Button onClick={connectNotion} disabled={loading} className="w-full" size="lg">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
            Conectar Notion
          </Button>
          <p className="text-center text-xs text-muted-foreground">Você será redirecionado para o Notion para autorizar o acesso. Se tiver o app Notion instalado no Mac, use Firefox ou uma janela anônima para evitar que o app intercepte o login.</p>
        </StepCard>
      )}

      {step === 2 && (
        <StepCard icon={<Database className="h-6 w-6 text-primary" />} title="Selecionar banco de dados" description="Escolha qual banco de dados do Notion contém seus posts para publicação.">
          {dbLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-3">
              {databases.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Banco de dados detectado</Label>
                  <Select value={selectedDbId} onValueChange={(v) => { setSelectedDbId(v); setManualUrl("") }}>
                    <SelectTrigger><SelectValue placeholder="Selecione um banco de dados…" /></SelectTrigger>
                    <SelectContent>{databases.map((db) => <SelectItem key={db.id} value={db.id}>{db.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {databases.length === 0 && (
                <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Nenhuma página acessível para este cliente.</p>
                    <p className="text-xs text-muted-foreground">Cada cliente que você cria tem sua própria autorização do Notion. Páginas compartilhadas com outros clientes não vêm junto automaticamente. Você tem 2 caminhos:</p>
                  </div>
                  <div className="space-y-2 rounded border bg-background/50 p-3 text-xs">
                    <p className="font-semibold">Opção 1 — No Notion, adicione esta integração ao banco</p>
                    <ol className="list-decimal space-y-0.5 pl-4 text-muted-foreground">
                      <li>Abra o banco/página no Notion</li>
                      <li>Clique em <strong>⋯</strong> (canto superior direito) → <strong>Conexões</strong></li>
                      <li>Procure pela integração e clique em <strong>Adicionar</strong></li>
                      <li>Volte aqui e cole a URL do banco abaixo</li>
                    </ol>
                  </div>
                  <div className="space-y-2 rounded border bg-background/50 p-3 text-xs">
                    <p className="font-semibold">Opção 2 — Reabrir autorização e marcar a página</p>
                    <p className="text-muted-foreground">Na tela do Notion, marque o checkbox da página que quer usar antes de confirmar.</p>
                    <Button onClick={connectNotion} disabled={loading} variant="outline" size="sm" className="w-full">
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                      Reabrir autorização do Notion
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{databases.length > 0 ? "Ou cole o link do banco diretamente" : "Cole a URL do banco aqui"}</Label>
                <Input placeholder="https://notion.so/workspace/Titulo-xxxxxxxx" value={manualUrl} onChange={(e) => { setManualUrl(e.target.value); setSelectedDbId("") }} />
                <p className="text-xs text-muted-foreground">No banco do Notion, clique em ⋯ → <strong>Copiar link</strong> e cole aqui. Vamos validar o acesso antes de salvar.</p>
              </div>
              <Button onClick={saveDatabase} disabled={!effectiveDbId || dbSaving} className="w-full" size="lg">
                {dbSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                Continuar
              </Button>
            </div>
          )}
        </StepCard>
      )}

      {step === 3 && pendingAccounts && pendingAccounts.length > 0 && (
        <StepCard icon={<Instagram className="h-6 w-6 text-primary" />} title="Quais páginas pertencem a este cliente?" description="O Facebook devolveu todas as páginas que você compartilhou com a integração. Marque só as que pertencem a este cliente — as outras são removidas.">
          <div className="space-y-2">
            {pendingAccounts.map((acc) => {
              const checked = keptAccountIds.has(acc.id)
              return (
                <label key={acc.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 transition-colors", checked ? "border-primary bg-primary/5" : "hover:bg-accent")}>
                  <input type="checkbox" checked={checked} onChange={() => togglePending(acc.id)} className="h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{acc.pageName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{acc.platform}</p>
                  </div>
                </label>
              )
            })}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button type="button" onClick={() => setKeptAccountIds(new Set(pendingAccounts.map((a) => a.id)))} className="underline hover:text-foreground">Marcar todas</button>
            <span>·</span>
            <button type="button" onClick={() => setKeptAccountIds(new Set())} className="underline hover:text-foreground">Limpar</button>
            <span className="ml-auto">{keptAccountIds.size} de {pendingAccounts.length} selecionada(s)</span>
          </div>
          <Button onClick={confirmPending} disabled={confirmingPending} className="w-full" size="lg">
            {confirmingPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
            {keptAccountIds.size === 0 ? `Continuar sem conectar nenhuma página (${pendingAccounts.length} serão removidas)` : `Confirmar ${keptAccountIds.size} página(s) e continuar`}
          </Button>
        </StepCard>
      )}

      {step === 3 && !(pendingAccounts && pendingAccounts.length > 0) && (
        <StepCard icon={<Instagram className="h-6 w-6 text-primary" />} title="Conectar contas sociais" description="Conecte suas contas via Facebook (Instagram + Facebook Pages). Outras plataformas podem ser conectadas depois nas Contas.">
          {wasCloned && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
              <strong>Workspace já estava conectado em outro cliente.</strong> Reaproveitamos o banco e o mapeamento — você só precisa conectar as contas sociais deste cliente agora.
            </div>
          )}
          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">O que você precisa:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Conta do Instagram Business ou Criador</li>
              <li>Página do Facebook vinculada à conta do Instagram</li>
              <li>Acesso de administrador à Página do Facebook</li>
            </ul>
          </div>
          <Button onClick={connectInstagram} disabled={loading} className="w-full" size="lg">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
            Conectar via Facebook
          </Button>
          <button type="button" onClick={() => setStep(4)} className="block w-full text-center text-xs text-muted-foreground underline hover:text-foreground">Pular por agora</button>
        </StepCard>
      )}

      {step === 4 && !connection && (
        <StepCard icon={<Settings className="h-6 w-6 text-primary" />} title="Mapeamento de campos" description="Carregando dados do banco do Notion…">
          <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          <p className="text-center text-xs text-muted-foreground">Se isso demorar mais de alguns segundos, talvez seja porque você não conectou um banco do Notion antes.</p>
          <Button variant="outline" onClick={() => router.push("/dashboard")} className="w-full">Ir para o Dashboard</Button>
        </StepCard>
      )}

      {step === 4 && connection && (
        <StepCard icon={<Settings className="h-6 w-6 text-primary" />} title="Mapeamento de campos" description="Diga ao VP Social onde estão os dados em cada coluna do seu banco do Notion.">
          <MappingForm connectionId={connection.id} wasCloned={wasCloned} onSaved={() => setStep(5)} onSkip={() => setStep(5)} />
        </StepCard>
      )}

      {step === 5 && (
        <StepCard icon={<Zap className="h-6 w-6 text-primary" />} title="Tudo pronto!" description="Suas conexões foram configuradas com sucesso. O VP Social vai publicar seus posts automaticamente.">
          <div className="space-y-3">
            <SuccessItem label="Notion conectado" />
            <SuccessItem label="Banco de dados selecionado" />
            <SuccessItem label="Contas sociais conectadas" />
            <SuccessItem label="Mapeamento configurado" />
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Próximos passos:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Verifique que os nomes das contas no Notion correspondem aos cadastrados</li>
              <li>Posts com status &quot;Agendamento&quot; e data passada serão publicados automaticamente</li>
              <li>Acompanhe tudo em <strong>Publicações</strong></li>
            </ul>
          </div>
          <Button onClick={finish} className="w-full" size="lg">Ir para o Dashboard <ArrowRight className="ml-2 h-4 w-4" /></Button>
        </StepCard>
      )}
    </div>
  )
}

function MappingForm({
  connectionId,
  wasCloned,
  onSaved,
  onSkip,
}: {
  connectionId: string
  wasCloned: boolean
  onSaved: () => void
  onSkip: () => void
}) {
  const [props, setProps] = useState<PropInfo[]>([])
  const [mapping, setMapping] = useState<FieldMapping>(DEFAULT_MAPPING)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [mapRes, propsRes] = await Promise.all([
          fetch(`/api/notion/workspaces/${connectionId}/mapping`).then(r => r.json()),
          fetch(`/api/notion/workspaces/${connectionId}/props`).then(r => r.json()),
        ])
        if (cancelled) return
        setMapping((prev) => ({ ...prev, ...DEFAULT_MAPPING, ...mapRes }))
        const list: PropInfo[] = Array.isArray(propsRes)
          ? propsRes.map((p: any) =>
              typeof p === "string"
                ? { name: p, type: "unknown", options: [] as string[] }
                : { name: p.name, type: p.type ?? "unknown", options: Array.isArray(p.options) ? p.options : [] }
            )
          : []
        setProps(list)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [connectionId])

  function setField(key: keyof FieldMapping, value: string) {
    setMapping(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/notion/workspaces/${connectionId}/mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapping),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao salvar mapeamento")
        return
      }
      toast.success("Mapeamento salvo!")
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Filter Notion props by type per field. Three rules:
  // - If we couldn't load props at all (network/auth failure), fall back to
  //   `current` so the form isn't completely empty.
  // - If props loaded AND `current` is a real prop with a wrong type (rare),
  //   preserve it so the user doesn't lose their intentional choice.
  // - If `current` is set but doesn't match any real prop (typical: stale
  //   default like "Status" pointing at a property the user removed), DROP
  //   it — surfacing a phantom prop would let the user save a broken mapping.
  function namesByTypes(types: string[], current?: string): string[] {
    if (!props.length) return current ? [current] : []
    const matching = props.filter((p) => types.includes(p.type)).map((p) => p.name)
    if (current && current.length > 0 && !matching.includes(current)) {
      const existsAsAnyType = props.some((p) => p.name === current)
      if (existsAsAnyType) return [current, ...matching]
    }
    return matching
  }

  const statusOptions = props.find((p) => p.name === mapping.statusField)?.options ?? []

  return (
    <div className="space-y-5">
      {wasCloned && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
          <strong>Mapeamento copiado de outro cliente.</strong> Como o banco é o mesmo, geralmente as colunas batem — confira abaixo e ajuste se precisar.
        </div>
      )}

      <Section label="Status de Publicação">
        <SelectField
          label="Campo de status"
          value={mapping.statusField}
          options={namesByTypes(["select", "status"], mapping.statusField)}
          onChange={(v) => setField("statusField", v)}
          hint="Apenas Select / Status"
        />
        <StatusValueSelect label='Valor "Pronto"' value={mapping.statusReadyValue} options={statusOptions} onChange={(v) => setField("statusReadyValue", v)} />
        <StatusValueSelect label='Valor "Publicado"' value={mapping.statusPublishedValue} options={statusOptions} onChange={(v) => setField("statusPublishedValue", v)} />
        <StatusValueSelect label='Valor "Erro"' value={mapping.statusErrorValue} options={statusOptions} onChange={(v) => setField("statusErrorValue", v)} />
      </Section>

      <Section label="Agendamento">
        <SelectField
          label="Data de publicação"
          value={mapping.dateField}
          options={namesByTypes(["date"], mapping.dateField)}
          onChange={(v) => setField("dateField", v)}
          hint="Apenas Date"
        />
        <SelectField
          label="Conta"
          value={mapping.accountField}
          options={namesByTypes(["select", "status", "rich_text", "title", "relation"], mapping.accountField)}
          onChange={(v) => setField("accountField", v)}
          hint="Texto, select ou relação"
        />
      </Section>

      <Section label="Conteúdo">
        <SelectField
          label="Legenda"
          value={mapping.captionField}
          options={namesByTypes(["rich_text", "title"], mapping.captionField)}
          onChange={(v) => setField("captionField", v)}
          hint="Texto longo (rich_text) ou título"
        />
        <SelectField
          label="Publicar em"
          value={mapping.publicarEmField}
          options={namesByTypes(["multi_select"], mapping.publicarEmField)}
          onChange={(v) => setField("publicarEmField", v)}
          hint="Apenas Multi-select"
        />
      </Section>

      <Section label="Mídia">
        <SelectField
          label="Imagens Feed"
          value={mapping.feedImageUrlsField}
          options={namesByTypes(["files"], mapping.feedImageUrlsField)}
          onChange={(v) => setField("feedImageUrlsField", v)}
          hint="Apenas Files"
        />
        <SelectField
          label="Mídia Vertical"
          value={mapping.verticalUrlsField}
          options={namesByTypes(["files"], mapping.verticalUrlsField)}
          onChange={(v) => setField("verticalUrlsField", v)}
          hint="Stories, Reels (Files)"
        />
        <SelectField
          label="Mídia Horizontal"
          value={mapping.horizontalUrlsField}
          options={namesByTypes(["files"], mapping.horizontalUrlsField)}
          onChange={(v) => setField("horizontalUrlsField", v)}
          hint="Apenas Files"
        />
        <SelectField
          label="Thumbnail"
          value={mapping.thumbnailUrlField}
          options={namesByTypes(["files"], mapping.thumbnailUrlField)}
          onChange={(v) => setField("thumbnailUrlField", v)}
          hint="Apenas Files"
        />
      </Section>

      <p className="text-xs text-muted-foreground">
        Analytics (curtidas, alcance etc.) ficam opcionais e podem ser configurados depois nas <strong>Configurações</strong>.
      </p>

      <div className="space-y-2">
        <Button onClick={save} disabled={saving} className="w-full" size="lg">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
          Salvar e continuar
        </Button>
        <button type="button" onClick={onSkip} className="block w-full text-center text-xs text-muted-foreground underline hover:text-foreground">Pular por agora (uso valores padrão)</button>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function SelectField({ label, value, options, onChange, hint }: { label: string; value: string; options: string[]; onChange: (v: string) => void; hint?: string }) {
  // Only show the current value if it's actually in `options`. Otherwise the
  // dropdown shows a stale default that doesn't exist in the database.
  const hasValue = value && options.includes(value)
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <Select value={hasValue ? value : NONE_VALUE} onValueChange={(v) => onChange(v === NONE_VALUE ? "" : v)}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Selecionar campo..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>— Não usar —</SelectItem>
          {options.filter(Boolean).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function StatusValueSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  // Always a Select — never a free text input. A typeable Input here let
  // users save values that didn't actually exist as Notion options, and
  // the cron would never match them.
  if (!options.length) {
    return (
      <div className="space-y-1">
        <Label className="text-sm">{label}</Label>
        <Select disabled value={NONE_VALUE}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione o campo de status acima primeiro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>—</SelectItem>
          </SelectContent>
        </Select>
      </div>
    )
  }
  // Same defensive rule: only show the current value if it matches one of
  // the real options. Otherwise the user sees a stale default ("Pronto")
  // that won't match any real status in Notion when the cron runs.
  const hasValue = value && options.includes(value)
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      <Select value={hasValue ? value : NONE_VALUE} onValueChange={(v) => onChange(v === NONE_VALUE ? "" : v)}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Selecionar valor..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>— Não usar —</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function StepCard({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">{icon}</div>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function SuccessItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-100 px-4 py-3 dark:bg-green-950/20 dark:border-green-900/30">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
      <span className="text-sm font-medium text-green-800 dark:text-green-300">{label}</span>
    </div>
  )
}
