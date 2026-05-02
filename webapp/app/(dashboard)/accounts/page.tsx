"use client"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Instagram, Trash2, Loader2, Facebook, Pencil, Check, X, Youtube, Linkedin, Building2, Star } from "lucide-react"
import { cn } from "@/lib/utils"

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
    </svg>
  )
}

type Platform = "instagram" | "facebook" | "youtube" | "tiktok" | "linkedin"

type Account = {
  id: string
  platform: Platform
  conta: string
  pageName: string
  instagramBusinessAccountId: string
  active: boolean
}

const PLATFORM_CONFIG: Record<Platform, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  connectLabel: string
  authUrl: string
}> = {
  instagram: {
    label: "Instagram",
    icon: Instagram,
    iconBg: "bg-gradient-to-br from-purple-500 to-pink-500",
    connectLabel: "Conectar com Facebook",
    authUrl: "/api/facebook/auth-url",
  },
  facebook: {
    label: "Facebook",
    icon: Facebook,
    iconBg: "bg-blue-600",
    connectLabel: "Conectar página do Facebook",
    authUrl: "/api/facebook/auth-url",
  },
  youtube: {
    label: "YouTube",
    icon: Youtube,
    iconBg: "bg-red-600",
    connectLabel: "Conectar canal do YouTube",
    authUrl: "/api/youtube/auth-url",
  },
  tiktok: {
    label: "TikTok",
    icon: TikTokIcon,
    iconBg: "bg-black",
    connectLabel: "Conectar conta TikTok",
    authUrl: "/api/tiktok/auth-url",
  },
  linkedin: {
    label: "LinkedIn",
    icon: Linkedin,
    iconBg: "bg-blue-700",
    connectLabel: "Conectar LinkedIn",
    authUrl: "/api/linkedin/auth-url",
  },
}

const PLATFORMS: Platform[] = ["instagram", "facebook", "youtube", "tiktok", "linkedin"]

export default function AccountsPage() {
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<Platform | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [unavailable, setUnavailable] = useState<Set<Platform>>(new Set())
  const [activeClient, setActiveClient] = useState<{ name: string; logoUrl: string | null } | null>(null)

  useEffect(() => {
    fetchAccounts()
    fetchActiveClient()
    checkPlatformAvailability()
    const connected = searchParams.get("connected")
    if (connected) toast.success(`Conta conectada com sucesso!`)
  }, [searchParams])

  async function fetchActiveClient() {
    const res = await fetch("/api/clients")
    const data = await res.json()
    const c = (data.clients ?? []).find((x: any) => x.id === data.activeClientId)
    if (c) setActiveClient({ name: c.name, logoUrl: c.logoUrl })
  }

  async function fetchAccounts() {
    const res = await fetch("/api/accounts")
    const data = await res.json()
    setAccounts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function checkPlatformAvailability() {
    const unavail = new Set<Platform>()
    for (const p of ["tiktok", "linkedin"] as Platform[]) {
      const config = PLATFORM_CONFIG[p]
      const res = await fetch(config.authUrl).catch(() => null)
      if (res?.status === 503) unavail.add(p)
    }
    setUnavailable(unavail)
  }

  async function handleConnect(platform: Platform) {
    const config = PLATFORM_CONFIG[platform]
    setConnecting(platform)
    try {
      const res = await fetch(config.authUrl)
      const data = await res.json()
      if (data.error) { toast.error(data.error); setConnecting(null); return }
      window.location.href = data.url
    } catch {
      toast.error("Erro ao conectar.")
      setConnecting(null)
    }
  }

  async function handleToggle(id: string, active: boolean) {
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    })
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, active: !active } : a)))
    toast.success(!active ? "Conta ativada." : "Conta desativada.")
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta conta?")) return
    await fetch(`/api/accounts/${id}`, { method: "DELETE" })
    setAccounts((prev) => prev.filter((a) => a.id !== id))
    toast.success("Conta removida.")
  }

  async function handleKeepOnly(account: Account) {
    const platformLabel = PLATFORM_CONFIG[account.platform].label
    const others = accounts.filter((a) => a.platform === account.platform && a.id !== account.id)
    if (!others.length) {
      toast.info("Já é a única conta deste cliente nessa plataforma.")
      return
    }
    if (!confirm(`Manter apenas "${account.conta}" para ${platformLabel} neste cliente? As outras ${others.length} conta(s) serão removidas.`)) return
    const res = await fetch(`/api/accounts/${account.id}/keep-only`, { method: "POST" })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Erro"); return }
    toast.success(`${data.removed} conta(s) removida(s)`)
    fetchAccounts()
  }

  function startEdit(account: Account) {
    setEditingId(account.id)
    setEditValue(account.conta)
  }

  async function saveEdit(id: string) {
    const trimmed = editValue.trim()
    if (!trimmed) return
    await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conta: trimmed }),
    })
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, conta: trimmed } : a)))
    setEditingId(null)
    toast.success("Nome da conta atualizado.")
  }

  const byPlatform = (p: Platform) => accounts.filter((a) => a.platform === p)

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight sm:text-4xl">Contas conectadas</h1>
          {activeClient && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {activeClient.logoUrl ? (
                <img src={activeClient.logoUrl} alt="" className="h-3.5 w-3.5 rounded object-cover" />
              ) : (
                <Building2 className="h-3 w-3" />
              )}
              {activeClient.name}
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          Apenas as contas deste cliente. Para conectar outro, troque o cliente na barra lateral.
        </p>
      </div>

      {accounts.length > 0 && (() => {
        const hasMultiplePerPlatform = PLATFORMS.some((p) => byPlatform(p).length > 1)
        return (
          <>
            {hasMultiplePerPlatform && (
              <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
                <strong>Várias contas conectadas em uma mesma plataforma.</strong>{" "}
                Cada cliente publica em <strong>uma conta por plataforma</strong>. Clique em
                <strong> &quot;Manter só esta&quot;</strong> na conta correta para remover as demais automaticamente.
              </div>
            )}
            <div className="mb-6 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
              <strong className="text-foreground">Dica:</strong> o campo <strong>Conta</strong> (editável com o lápis)
              deve bater com o valor da propriedade <strong>Conta</strong> no banco do Notion deste cliente.
            </div>
          </>
        )
      })()}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          {PLATFORMS.map((platform) => {
            const config = PLATFORM_CONFIG[platform]
            const platformAccounts = byPlatform(platform)
            const isUnavailable = unavailable.has(platform)
            const Icon = config.icon

            return (
              <Card key={platform}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", config.iconBg)}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <CardTitle className="text-base">{config.label}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {platformAccounts.length} {platformAccounts.length === 1 ? "conta" : "contas"}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleConnect(platform)}
                      disabled={connecting === platform || isUnavailable}
                      title={isUnavailable ? "Credenciais não configuradas" : undefined}
                      className="max-w-full whitespace-normal text-left"
                    >
                      {connecting === platform ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      ) : (
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{isUnavailable ? "Aguardando credenciais" : config.connectLabel}</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {platformAccounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      Nenhuma conta {config.label} conectada.
                      {isUnavailable && " Configure as credenciais no .env para habilitar."}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {platformAccounts.map((account) => (
                        <div key={account.id} className="flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", config.iconBg)}>
                              <Icon className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div className="min-w-0 flex-1">
                              {editingId === account.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    className="h-7 w-44 text-sm"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveEdit(account.id)
                                      if (e.key === "Escape") setEditingId(null)
                                    }}
                                    autoFocus
                                  />
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => saveEdit(account.id)}>
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-sm truncate max-w-full">{account.conta}</span>
                                  <Badge variant={account.active ? "success" : "secondary"} className="text-xs">
                                    {account.active ? "Ativa" : "Inativa"}
                                  </Badge>
                                  <button onClick={() => startEdit(account)} className="text-muted-foreground hover:text-foreground transition-colors">
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                              <p className="text-xs text-muted-foreground truncate">{account.pageName}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                            {platformAccounts.length > 1 && (
                              <Button variant="outline" size="sm" onClick={() => handleKeepOnly(account)} title="Manter apenas esta para este cliente (remove as outras de mesma plataforma)">
                                <Star className="h-3.5 w-3.5" />
                                Manter só esta
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => handleToggle(account.id, account.active)}>
                              {account.active ? "Desativar" : "Ativar"}
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(account.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
