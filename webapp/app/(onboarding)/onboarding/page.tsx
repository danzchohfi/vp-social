"use client"
import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  BookOpen, Instagram, CheckCircle2, Loader2, ExternalLink,
  ArrowRight, Database, Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Step = 1 | 2 | 3 | 4

type Connection = {
  id: string
  workspaceName: string
  workspaceIcon?: string | null
  databaseId: string | null
}

type NotionDatabase = { id: string; name: string }

const STEPS = [
  { num: 1, label: "Conectar Notion" },
  { num: 2, label: "Selecionar banco" },
  { num: 3, label: "Conectar Instagram" },
  { num: 4, label: "Pronto!" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)

  // Step 1 — Notion connection
  const [connection, setConnection] = useState<Connection | null>(null)

  // Step 2 — Database selection
  const [databases, setDatabases] = useState<NotionDatabase[]>([])
  const [selectedDbId, setSelectedDbId] = useState("")
  const [dbLoading, setDbLoading] = useState(false)
  const [dbSaving, setDbSaving] = useState(false)

  // Step 3 — Instagram (tracked via step === 4)

  // ─── Detect OAuth redirects ─────────────────────────────────────────────────

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

  // ─── Load existing connection on mount ────────────────────────────────────

  const loadConnection = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/notion/connection")
      const data = await res.json()
      const list: Connection[] = data.connections ?? []
      if (list.length > 0) {
        const conn = list[0]
        setConnection(conn)
        if (conn.databaseId) {
          // Already has a database selected — skip to step 3
          setStep(3)
        } else {
          setStep(2)
          loadDatabases(conn.id)
        }
      } else {
        setStep(1)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConnection()
  }, [loadConnection])

  // ─── Load databases ────────────────────────────────────────────────────────

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

  // ─── Save database selection ───────────────────────────────────────────────

  const saveDatabase = async () => {
    if (!connection || !selectedDbId) return
    setDbSaving(true)
    try {
      await fetch("/api/notion/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id, databaseId: selectedDbId }),
      })
      setStep(3)
    } finally {
      setDbSaving(false)
    }
  }

  // ─── Connect Notion ────────────────────────────────────────────────────────

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

  // ─── Connect Instagram ─────────────────────────────────────────────────────

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

  // ─── Finish ────────────────────────────────────────────────────────────────

  const finish = () => router.push("/dashboard")

  // ─── Render ────────────────────────────────────────────────────────────────

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
            Você será redirecionado para o Notion para autorizar o acesso.
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
          ) : databases.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nenhum banco de dados encontrado no workspace. Certifique-se de ter compartilhado
              uma página ou database com a integração Publify no Notion.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Banco de dados</Label>
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
                onClick={saveDatabase}
                disabled={!selectedDbId || dbSaving}
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
            </div>
          )}
          {databases.length > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Você pode trocar o banco de dados depois nas Configurações.
            </p>
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
