"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Loader2,
  RefreshCw,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Instagram,
  Facebook,
  Youtube,
  Linkedin,
  MessageCircle,
  BookOpen,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Status = "ok" | "warn" | "error"
type WhatsappStatus = Status | "not_configured"

type NotionRow = {
  id: string
  workspaceName: string
  clientId: string | null
  clientName: string | null
  status: Status
  statusMessage: string
  lastSuccessAt: string | null
  errorCount7d: number
  publishCount7d: number
}

type SocialRow = {
  id: string
  platform: string
  accountName: string
  clientId: string | null
  clientName: string | null
  status: Status
  statusMessage: string
  lastRefreshError: string | null
  lastRefreshErrorAt: string | null
  lastSuccessAt: string | null
  errorCount7d: number
  publishCount7d: number
}

type WhatsappBlock = {
  configured: boolean
  status: WhatsappStatus
  statusMessage: string
  phoneNumberId: string | null
  templateName: string | null
}

type HealthResponse = {
  notion: NotionRow[]
  social: SocialRow[]
  whatsapp: WhatsappBlock
  quickStats: { ok: number; warn: number; error: number; total: number }
}

const PLATFORM_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  tiktok: Activity,
  linkedin: Linkedin,
}

const RECONNECT_HREF: Record<string, string> = {
  notion: "/api/notion/auth-url",
  instagram: "/api/facebook/auth-url",
  facebook: "/api/facebook/auth-url",
  youtube: "/api/youtube/auth-url",
  tiktok: "/api/tiktok/auth-url",
  linkedin: "/api/linkedin/auth-url",
  whatsapp: "/settings",
}

function StatusPill({ status }: { status: WhatsappStatus }) {
  if (status === "ok") {
    return (
      <Badge variant="success" size="sm">
        <CheckCircle2 className="h-3 w-3" />
        Saudável
      </Badge>
    )
  }
  if (status === "warn") {
    return (
      <Badge variant="warning" size="sm">
        <AlertTriangle className="h-3 w-3" />
        Atenção
      </Badge>
    )
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" size="sm">
        <XCircle className="h-3 w-3" />
        Erro
      </Badge>
    )
  }
  return (
    <Badge variant="muted" size="sm">
      Não configurado
    </Badge>
  )
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (days >= 1) return `há ${days}d`
  const hours = Math.floor(ms / (60 * 60 * 1000))
  if (hours >= 1) return `há ${hours}h`
  const mins = Math.floor(ms / (60 * 1000))
  if (mins >= 1) return `há ${mins}min`
  return "agora"
}

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string } | undefined>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/health")
      if (!res.ok) throw new Error("Erro ao carregar")
      const json = await res.json()
      setData(json)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function refresh() {
    setRefreshing(true)
    await load()
  }

  async function runTest(type: "notion" | "social" | "whatsapp", id: string) {
    const key = `${type}:${id}`
    setTesting(key)
    try {
      const res = await fetch(`/api/health/test/${type}/${id}`, { method: "POST" })
      const json = await res.json()
      setTestResults((prev) => ({ ...prev, [key]: { ok: !!json.ok, message: json.message ?? json.error ?? "—" } }))
      if (json.ok) toast.success(json.message ?? "OK")
      else toast.error(json.message ?? json.error ?? "Falha")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro de rede")
    } finally {
      setTesting(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-10 px-4">
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!data) return null

  const allEmpty = data.notion.length === 0 && data.social.length === 0 && !data.whatsapp.configured

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <PageHeader
        title="Saúde das integrações"
        subtitle="Status das conexões + taxa de erro nos últimos 7 dias"
        action={
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar
          </Button>
        }
      />

      {allEmpty ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Activity}
              title="Nenhuma integração configurada"
              description="Conecte Notion, redes sociais e WhatsApp pra monitorar a saúde aqui."
              action={{ label: "Configurar agora", href: "/settings" }}
              tone="primary"
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Quick stats */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="border-l-4 border-l-success">
              <CardContent className="pt-4">
                <p className="text-3xl font-semibold text-success">{data.quickStats.ok}</p>
                <p className="mt-1 text-sm text-muted-foreground">Saudáveis</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-warning">
              <CardContent className="pt-4">
                <p className="text-3xl font-semibold text-warning">{data.quickStats.warn}</p>
                <p className="mt-1 text-sm text-muted-foreground">Atenção</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-destructive">
              <CardContent className="pt-4">
                <p className="text-3xl font-semibold text-destructive">{data.quickStats.error}</p>
                <p className="mt-1 text-sm text-muted-foreground">Com erro</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-3xl font-semibold">{data.quickStats.total}</p>
                <p className="mt-1 text-sm text-muted-foreground">Total</p>
              </CardContent>
            </Card>
          </div>

          {/* Notion section */}
          {data.notion.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-base font-semibold flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                Notion ({data.notion.length})
              </h2>
              <Card>
                <CardContent className="pt-2 pb-2">
                  <div className="divide-y">
                    {data.notion.map((row) => {
                      const key = `notion:${row.id}`
                      const expanded = expandedRow === key
                      const test = testResults[key]
                      return (
                        <div key={row.id}>
                          <button
                            type="button"
                            onClick={() => setExpandedRow(expanded ? null : key)}
                            className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring -mx-2 px-2 rounded"
                          >
                            <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{row.workspaceName}</p>
                              <p className="truncate text-[12px] text-muted-foreground">
                                {row.clientName ?? "(sem cliente)"} · última pub {timeAgo(row.lastSuccessAt)}
                                {row.publishCount7d > 0 && (
                                  <> · {row.errorCount7d}/{row.publishCount7d} falhas 7d</>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusPill status={row.status} />
                              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                            </div>
                          </button>
                          {expanded && (
                            <div className="pb-4 pl-7 pr-2 space-y-3 text-sm">
                              <p className="text-muted-foreground">{row.statusMessage}</p>
                              {test && (
                                <p className={cn("text-sm", test.ok ? "text-success" : "text-destructive")}>
                                  {test.ok ? "✓" : "✗"} {test.message}
                                </p>
                              )}
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => runTest("notion", row.id)}
                                  disabled={testing === key}
                                >
                                  {testing === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                  Testar conexão
                                </Button>
                                <Button size="sm" variant="outline" asChild>
                                  <Link href={RECONNECT_HREF.notion}>
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Reconectar Notion
                                  </Link>
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </section>
          )}

          {/* Social section */}
          {data.social.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Redes sociais ({data.social.length})
              </h2>
              <Card>
                <CardContent className="pt-2 pb-2">
                  <div className="divide-y">
                    {data.social.map((row) => {
                      const key = `social:${row.id}`
                      const expanded = expandedRow === key
                      const test = testResults[key]
                      const Icon = PLATFORM_ICON[row.platform.toLowerCase()] ?? Activity
                      const reconnectHref = RECONNECT_HREF[row.platform.toLowerCase()] ?? "/accounts"
                      return (
                        <div key={row.id}>
                          <button
                            type="button"
                            onClick={() => setExpandedRow(expanded ? null : key)}
                            className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring -mx-2 px-2 rounded"
                          >
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {row.accountName} <span className="text-[12px] text-muted-foreground">· {row.platform}</span>
                              </p>
                              <p className="truncate text-[12px] text-muted-foreground">
                                {row.clientName ?? "(sem cliente)"} · última pub {timeAgo(row.lastSuccessAt)}
                                {row.publishCount7d > 0 && (
                                  <> · {row.errorCount7d}/{row.publishCount7d} falhas 7d</>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusPill status={row.status} />
                              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                            </div>
                          </button>
                          {expanded && (
                            <div className="pb-4 pl-7 pr-2 space-y-3 text-sm">
                              <p className="text-muted-foreground">{row.statusMessage}</p>
                              {row.lastRefreshError && (
                                <p className="text-destructive break-all">
                                  Último erro de refresh: <span className="font-mono text-[12px]">{row.lastRefreshError}</span>
                                </p>
                              )}
                              {test && (
                                <p className={cn("text-sm", test.ok ? "text-success" : "text-destructive")}>
                                  {test.ok ? "✓" : "✗"} {test.message}
                                </p>
                              )}
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => runTest("social", row.id)}
                                  disabled={testing === key}
                                >
                                  {testing === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                  Testar conexão
                                </Button>
                                <Button size="sm" variant="outline" asChild>
                                  <Link href={reconnectHref}>
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Reconectar
                                  </Link>
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </section>
          )}

          {/* WhatsApp section */}
          <section className="mb-6">
            <h2 className="mb-2 text-base font-semibold flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              WhatsApp da agência
            </h2>
            <Card>
              <CardContent className="pt-4">
                {!data.whatsapp.configured ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm">{data.whatsapp.statusMessage}</p>
                      <p className="text-[12px] text-muted-foreground">
                        Configure em /settings → WhatsApp da agência pra disparar aprovações automáticas
                      </p>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/settings">Configurar</Link>
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {data.whatsapp.templateName}
                        </p>
                        <p className="text-[12px] text-muted-foreground">
                          phone_number_id: <span className="font-mono">{data.whatsapp.phoneNumberId}</span>
                        </p>
                      </div>
                      <StatusPill status={data.whatsapp.status} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // Auth me to get my own userId — use a tagged key for testing state
                          fetch("/api/auth/get-session").then((r) => r.json()).then((s) => {
                            if (s?.user?.id) runTest("whatsapp", s.user.id)
                          })
                        }}
                        disabled={testing?.startsWith("whatsapp:")}
                      >
                        {testing?.startsWith("whatsapp:") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Testar credenciais
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link href="/settings">Editar config</Link>
                      </Button>
                    </div>
                    {Object.entries(testResults).find(([k]) => k.startsWith("whatsapp:"))?.[1] && (
                      <p className={cn(
                        "mt-2 text-sm",
                        Object.entries(testResults).find(([k]) => k.startsWith("whatsapp:"))?.[1]?.ok ? "text-success" : "text-destructive"
                      )}>
                        {Object.entries(testResults).find(([k]) => k.startsWith("whatsapp:"))?.[1]?.ok ? "✓" : "✗"}{" "}
                        {Object.entries(testResults).find(([k]) => k.startsWith("whatsapp:"))?.[1]?.message}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}
