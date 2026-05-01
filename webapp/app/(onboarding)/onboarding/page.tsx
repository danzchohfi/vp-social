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
  ArrowRight, Database, Zap, Building2,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Step = 0 | 1 | 2 | 3 | 4

type Connection = {
  id: string
  workspaceName: string
  workspaceIcon?: string | null
  databaseId: string | null
}

type NotionDatabase = { id: string; name: string }

const STEPS = [
  { num: 0, label: "Cliente" },
  { num: 1, label: "Notion" },
  { num: 2, label: "Banco" },
  { num: 3, label: "Instagram" },
  { num: 4, label: "Pronto!" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep] = useState<Step>(0)
  const [loading, setLoading] = useState(false)

  // Step 0 — Client name
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientName, setClientName] = useState("")
  const [clientLogo, setClientLogo] = useState("")
  const [savingClient, setSavingClient] = useState(false)

  // Step 1 — Notion connection
  const [connection, setConnection] = useState<Connection | null>(null)

  // Step 2 — Database selection
  const [databases, setDatabases] = useState<NotionDatabase[]>([])
  const [selectedDbId, setSelectedDbId] = useState("")
  const [manualUrl, setManualUrl] = useState("")
  const [dbLoading, setDbLoading] = useState(false)
  const [dbSaving, setDbSaving] = useState(false)

  // Step 3 — Instagram (tracked via step === 4)

  // ─── Detect OAuth redirects ──────────────────────────────────────

  useEffect(() => {
    const notionConnected = searchParams.get("notion_connected")
    const igConnected = searchParams.get("instagram_connected")
    const error = searchParams.get("error")

    if (error) {
      // Stay on current step, errors are surfaced by missing connection state
      return
    }

    if (notionConnected === "true") {
      loadConnection()
      return
    }

    if (igConnected === "true") {
      setStep(4)
      return
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load existing connection on mount ──────────────────────────────────

  const loadConnection = useCallback(async () => {
    setLoading(true)
    try {
      // Step 0: ensure we have a named client. The default "Cliente padrão"
      // must be renamed before continuing onboarding.
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
    loadConnection()
  }, [loadConnection])

  // ─── Save client (step 0) ────────────────────────────────────────────────

  const saveClient = async () => {
    if (!clientId || !clientName.trim()) return
    setSavingClient(true)
    try {
      await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clientName.trim(), logoUrl: clientLogo.trim() || null }),
      })
      setStep(1)
    } finally {
      setSavingClient(false)
    }
  }

  // ─── Load databases ──────────────────────────────────────────────────────────

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

  // ─── Extract DB ID from Notion URL ───────────────────────────────────────

  function extractNotionId(input: string): string {
    const match = input.match(/([a-f0-9]{32})/i)
    if (match) {
      const raw = match[1]
      return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`
    }
    return input.trim()
  }

  const effectiveDbId = selectedDbId || (manualUrl ? extractNotionId(manualUrl) : "")

  // ─── Save database selection ────────────────────────────────────────────────

  const saveDatabase = async () => {
    if (!connection || !effectiveDbId) return
    setDbSaving(true)
    try {
      await fetch("/api/notion/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id, databaseId: effectiveDbId }),
      })
      setStep(3)
    } finally {
      setDbSaving(false)
    }
  }

  // ─── Connect Notion ──────────────────────────────────────────────────────────

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

  // ─── Connect Instagram ────────────────────────────────────────────────────────

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

  // ─── Finish ──────────────────────────────────────────────────────────────────

  const finish = () => router.push("/dashboard")

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-lg space-y-8">
      {/* Step indicators */}
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
              <span
                className={cn(
                  "text-xs",
                  step === s.num ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-2 mb-5 h-0.5 w-12 transition-colors",
                  step > s.num ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step cards */}
      {step === 0 && (
        <StepCard
          icon={<Building2 className="h-6 w-6 text-primary" />}
          title="Seu primeiro cliente"
          description="Cada cliente tem seu próprio Notion, contas sociais e histórico isolados. Comece dando um nome."
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome do cliente</Label>
              <Input
                autoFocus
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveClient() }}
                placeholder="Ex: Vitamina Publicitária, Naydacury…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Logo (URL opcional)</Label>
              <Input
                value={clientLogo}
                onChange={(e) => setClientLogo(e.target.value)}
                placeholder="https://exemplo.com/logo.png"
              />
            </div>
            <Button onClick={saveClient} disabled={savingClient || !clientName.trim()} className="w-full" size="lg">
              {savingClient ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              Continuar
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Você pode adicionar mais clientes depois em &quot;Clientes&quot;.
            </p>
          </div>
        </StepCard>
      )}

      {step === 1 && (
        <StepCard
          icon={<BookOpen className="h-6 w-6 text-primary" />}
          title="Conectar ao Notion"
          description="Autorize o Publify a acessar seus workspaces no Notion para buscar seus posts agendados."
        >
          <Button onClick={connectNotion} disabled={loading} className="w-full" size="lg">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="mr-2 h-4 w-4" />
            )}
            Conectar Notion
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Você será redirecionado para o Notion para autorizar o acesso.{" "}
            Se tiver o app Notion instalado no Mac, use Firefox ou uma janela anônima para evitar que o app intercepte o login.
          </p>
        </StepCard>
      )}

      {step === 2 && (
        <StepCard
          icon={<Database className="h-6 w-6 text-primary" />}
          title="Selecionar banco de dados"
          description="Escolha qual banco de dados do Notion contém seus posts para publicação."
        >
          {dbLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {databases.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Banco de dados detectado</Label>
                  <Select value={selectedDbId} onValueChange={(v) => { setSelectedDbId(v); setManualUrl("") }}>
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
              )}
              <div className="space-y-1.5">
                <Label>
                  {databases.length > 0 ? "Ou cole o link do banco diretamente" : "Link do banco de dados no Notion"}
                </Label>
                {databases.length === 0 && (
                  <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground mb-2">
                    Nenhum banco encontrado automaticamente.
                  </div>
                )}
                <Input
                  placeholder="https://notion.so/workspace/Titulo-xxxxxxxx"
                  value={manualUrl}
                  onChange={(e) => { setManualUrl(e.target.value); setSelectedDbId("") }}
                />
                <p className="text-xs text-muted-foreground">
                  Abra o banco no Notion, copie a URL e cole aqui.
                </p>
              </div>
              <Button
                onClick={saveDatabase}
                disabled={!effectiveDbId || dbSaving}
                className="w-full"
                size="lg"
              >
                {dbSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                Continuar
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Você pode trocar o banco de dados depois nas Configurações.
              </p>
            </div>
          )}
        </StepCard>
      )}

      {step === 3 && (
        <StepCard
          icon={<Instagram className="h-6 w-6 text-primary" />}
          title="Conectar Instagram"
          description="Conecte sua conta do Instagram via Facebook para habilitar as publicações automáticas."
        >
          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">O que você precisa:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Conta do Instagram Business ou Criador</li>
              <li>Página do Facebook vinculada à conta do Instagram</li>
              <li>Acesso de administrador à Página do Facebook</li>
            </ul>
          </div>
          <Button onClick={connectInstagram} disabled={loading} className="w-full" size="lg">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="mr-2 h-4 w-4" />
            )}
            Conectar via Facebook
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Você será redirecionado para o Facebook para autorizar o acesso.
          </p>
        </StepCard>
      )}

      {step === 4 && (
        <StepCard
          icon={<Zap className="h-6 w-6 text-primary" />}
          title="Tudo pronto!"
          description="Suas conexões foram configuradas com sucesso. O Publify vai publicar seus posts automaticamente."
        >
          <div className="space-y-3">
            <SuccessItem label="Notion conectado" />
            <SuccessItem label="Banco de dados selecionado" />
            <SuccessItem label="Instagram conectado" />
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Próximos passos:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Configure os mapeamentos de campos nas Configurações</li>
              <li>Verifique que os nomes das contas no Notion correspondem aos cadastrados</li>
              <li>Posts com status &quot;Agendamento&quot; e data passada serão publicados automaticamente</li>
            </ul>
          </div>
          <Button onClick={finish} className="w-full" size="lg">
            Ir para o Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </StepCard>
      )}
    </div>
  )
}

function StepCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          {icon}
        </div>
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
