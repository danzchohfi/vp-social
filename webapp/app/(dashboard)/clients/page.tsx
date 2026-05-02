"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Building2, Check, Loader2, Plus, Trash2, Pencil, X, Users, Mail, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

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
}

type Invite = {
  id: string
  email: string
  role: string
  token: string
  expiresAt: string
}

export default function ClientsPage() {
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
  const [membersOpen, setMembersOpen] = useState<string | null>(null)

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
      toast.success(`Cliente "${data.client.name}" criado`)
      setNewName("")
      setNewLogo("")
      setShowNew(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
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
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight sm:text-4xl">Clientes</h1>
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
            <div className="space-y-1.5">
              <Label>Logo (URL opcional)</Label>
              <Input
                value={newLogo}
                onChange={(e) => setNewLogo(e.target.value)}
                placeholder="https://exemplo.com/logo.png"
              />
            </div>
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
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => {
            const isActive = c.id === activeId
            const isEditing = editingId === c.id
            const isOwner = c.role === "owner"
            const showMembers = membersOpen === c.id
            return (
              <Card key={c.id} className={cn(isActive && "border-primary/50 ring-1 ring-primary/20")}>
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
                      <div className="space-y-1.5">
                        <Label>Logo (URL)</Label>
                        <Input
                          value={editLogo}
                          onChange={(e) => setEditLogo(e.target.value)}
                          placeholder="https://exemplo.com/logo.png"
                        />
                      </div>
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
                    <div className="flex items-center gap-4">
                      {c.logoUrl ? (
                        <img src={c.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Building2 className="h-6 w-6" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">{c.name}</p>
                          {isActive && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              Ativo
                            </span>
                          )}
                          {!isOwner && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {c.role === "admin" ? "Admin" : "Membro"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Criado em {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0 flex-wrap">
                        {!isActive && (
                          <Button variant="outline" size="sm" onClick={() => setActive(c.id)}>
                            Tornar ativo
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setMembersOpen(showMembers ? null : c.id)}
                          title="Membros"
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                        {isOwner && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => startEdit(c)} title="Editar">
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

                  {showMembers && !isEditing && (
                    <div className="mt-4 pt-4 border-t">
                      <MembersPanel clientId={c.id} canManage={isOwner} />
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

function MembersPanel({ clientId, canManage }: { clientId: string; canManage: boolean }) {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member")
  const [inviting, setInviting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/members`)
      const data = await res.json()
      setMembers(data.members ?? [])
      setInvites(data.invites ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [clientId])

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro")
      await navigator.clipboard.writeText(data.inviteUrl).catch(() => {})
      toast.success("Convite criado e link copiado para a área de transferência")
      setInviteEmail("")
      setShowInvite(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setInviting(false)
    }
  }

  async function removeMember(memberId: string, name: string) {
    if (!confirm(`Remover ${name}?`)) return
    const res = await fetch(`/api/clients/${clientId}/members/${memberId}`, { method: "DELETE" })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Erro"); return }
    toast.success("Membro removido")
    load()
  }

  async function revokeInvite(inviteId: string) {
    const res = await fetch(`/api/clients/${clientId}/invites/${inviteId}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Erro"); return }
    toast.success("Convite revogado")
    load()
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invites/${token}`
    navigator.clipboard.writeText(url).then(() => toast.success("Link copiado"))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Membros ({members.length})</p>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setShowInvite(!showInvite)}>
            <Mail className="h-3.5 w-3.5" />
            Convidar
          </Button>
        )}
      </div>

      {showInvite && canManage && (
        <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
          <div className="space-y-1.5">
            <Label className="text-xs">Email do convidado</Label>
            <Input
              autoFocus
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendInvite() }}
              placeholder="email@exemplo.com"
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Papel</Label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="w-full h-8 rounded border bg-background px-2 text-sm"
            >
              <option value="member">Membro (acesso ao cliente)</option>
              <option value="admin">Admin (mesmas permissões do owner, exceto excluir cliente)</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Gerar convite
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowInvite(false)}>
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Após gerar, o link é copiado para sua área de transferência. Envie para o convidado.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="space-y-1.5">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  {m.userImage ? (
                    <img src={m.userImage} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {m.userName?.charAt(0).toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.userName}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.userEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground capitalize">{m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Membro"}</span>
                  {canManage && m.role !== "owner" && (
                    <Button variant="ghost" size="icon" onClick={() => removeMember(m.id, m.userName)} className="text-destructive hover:text-destructive h-7 w-7">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {invites.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Convites pendentes</p>
              <div className="space-y-1.5">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{inv.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.role === "admin" ? "Admin" : "Membro"} · expira {new Date(inv.expiresAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => copyInviteLink(inv.token)} className="h-7 w-7" title="Copiar link">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => revokeInvite(inv.id)} className="text-destructive hover:text-destructive h-7 w-7" title="Revogar">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
