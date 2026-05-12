"use client"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Building2, Check, Loader2, Plus, Trash2, Pencil, X, BarChart3, Settings } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { LogoUploader } from "@/components/dashboard/logo-uploader"
import { PostRowSkeleton } from "@/components/ui/skeleton"

type Client = {
  id: string
  name: string
  logoUrl: string | null
  role: string
  createdAt: string
}

type Member = {
  id: string
  userId: string
  userName: string
  userEmail: string
  userImage: string | null
  role: string
  scope: string
}

type Invite = {
  id: string
  email: string
  role: string
  scope: string
  token: string
  expiresAt: string
}

export default function ClientsPage() {
  const searchParams = useSearchParams()
  const [clients, setClients] = useState<Client[]>([])
  const [activeId, setActiveId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState("")
  const [newLogo, setNewLogo] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editLogo, setEditLogo] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)
  // Config panels (Setup, Approval, Notion Contas, Members) moved to
  // /settings in #65 — /clients is now just a roster. Toggle state
  // removed. Deep-link from /settings still flows here for backward
  // compat with anywhere a link to /clients?panel=X was bookmarked
  // (no-op render now).

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/clients")
      const data = await res.json()
      setClients(data.clients ?? [])
      setActiveId(data.activeClientId ?? "")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Legacy deep-link (?focus=...&panel=...) from before the panels
  // moved to /settings. Redirect there instead of trying to render
  // anything inline here. Preserves shareable URLs.
  useEffect(() => {
    if (loading) return
    if (typeof window === "undefined") return
    const focus = searchParams?.get("focus") ?? ""
    const panel = searchParams?.get("panel") ?? ""
    if (focus && panel) {
      window.location.href = "/settings"
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, clients])

  async function setActive(id: string) {
    const res = await fetch("/api/clients/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: id }),
    })
    if (!res.ok) { toast.error("Erro ao trocar cliente"); return }
    setActiveId(id)
    toast.success("Cliente ativo trocado")
    window.location.reload()
  }

  async function createClient() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), logoUrl: newLogo.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro")
      // Make active and send through onboarding so the new client gets a
      // proper Notion + Contas + Mapeamento setup. Without this the user has
      // to manually click "Tornar ativo" and navigate to /onboarding, ending
      // up in a half-configured state.
      await fetch("/api/clients/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: data.client.id }),
      })
      toast.success(`Cliente "${data.client.name}" criado — configurando…`)
      window.location.href = "/onboarding"
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
      setCreating(false)
    }
  }

  function startEdit(c: Client) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditLogo(c.logoUrl ?? "")
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/clients/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), logoUrl: editLogo.trim() || null }),
      })
      if (!res.ok) throw new Error("Erro ao atualizar")
      toast.success("Cliente atualizado")
      setEditingId(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSavingEdit(false)
    }
  }

  async function deleteClient(c: Client) {
    if (!confirm(`Excluir "${c.name}"? Todos os dados (Notion, contas, histórico) deste cliente serão removidos.`)) return
    const res = await fetch(`/api/clients/${c.id}`, { method: "DELETE" })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Erro ao excluir"); return }
    toast.success("Cliente excluído")
    await load()
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl tracking-tight sm:text-4xl">Clientes</h1>
          <p className="text-muted-foreground">Cada cliente tem seu próprio Notion, contas sociais e histórico.</p>
        </div>
        <Button onClick={() => setShowNew(true)} disabled={showNew}>
          <Plus className="h-4 w-4" />
          Novo cliente
        </Button>
      </div>

      {showNew && (
        <Card className="mb-4">
          <CardContent className="pt-6 space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createClient() }}
                placeholder="Nome do cliente (ex: Vitamina, Naydacury)"
              />
            </div>
            <LogoUploader value={newLogo} onChange={setNewLogo} />
            <div className="flex gap-2 pt-1">
              <Button onClick={createClient} disabled={creating || !newName.trim()}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Criar
              </Button>
              <Button variant="outline" onClick={() => { setShowNew(false); setNewName(""); setNewLogo("") }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <PostRowSkeleton count={3} />
      ) : (
        <div className="space-y-2">
          {clients.map((c) => {
            const isActive = c.id === activeId
            const isEditing = editingId === c.id
            const isOwner = c.role === "owner"
            return (
              <Card id={`client-${c.id}`} key={c.id} className={cn("scroll-mt-20", isActive && "border-primary/50 ring-1 ring-primary/20")}>
                <CardContent className="pt-6">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Nome</Label>
                        <Input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit() }}
                        />
                      </div>
                      <LogoUploader value={editLogo} onChange={setEditLogo} />
                      <div className="flex gap-2 pt-1">
                        <Button onClick={saveEdit} disabled={savingEdit || !editName.trim()} size="sm">
                          {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Salvar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                      {c.logoUrl ? (
                        <img src={c.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Building2 className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 max-w-full break-words font-semibold">{c.name}</p>
                          {isActive && (
                            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-sm font-medium text-primary">
                              Ativo
                            </span>
                          )}
                          {!isOwner && (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground">
                              {c.role === "admin" ? "Admin" : "Membro"}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Criado em {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1 sm:shrink-0">
                        {!isActive && (
                          <Button variant="outline" size="sm" onClick={() => setActive(c.id)}>
                            Tornar ativo
                          </Button>
                        )}
                        {isActive && (
                          <Button variant="ghost" size="icon" asChild title="Configurar este cliente (/settings)">
                            <Link href="/settings">
                              <Settings className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" asChild title="Relatório mensal">
                          <Link href={`/clients/${c.id}/report`}>
                            <BarChart3 className="h-4 w-4" />
                          </Link>
                        </Button>
                        {isOwner && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => startEdit(c)} title="Editar nome / logo">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteClient(c)}
                              disabled={clients.length <= 1}
                              title={clients.length <= 1 ? "Você precisa manter pelo menos um cliente" : "Excluir"}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
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
