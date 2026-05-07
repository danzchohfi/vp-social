"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Building2, Check, Loader2, Plus, Trash2, Pencil, X, Users, Mail, Copy, MessageCircle } from "lucide-react"
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
  const [approvalOpen, setApprovalOpen] = useState<string | null>(null)

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
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Clientes</h1>
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
                            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              Ativo
                            </span>
                          )}
                          {!isOwner && (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {c.role === "admin" ? "Admin" : "Membro"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Criado em {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1 sm:shrink-0">
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setApprovalOpen(approvalOpen === c.id ? null : c.id)}
                            title="Aprovação cliente (link calendário + ManyChat)"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        )}
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

                  {approvalOpen === c.id && !isEditing && isOwner && (
                    <div className="mt-4 pt-4 border-t">
                      <ApprovalPanel clientId={c.id} clientName={c.name} />
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
  const [inviteScope, setInviteScope] = useState<"client" | "agency">("client")
  const [inviting, setInviting] = useState(false)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null)

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
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole, scope: inviteScope }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro")
      await navigator.clipboard.writeText(data.inviteUrl).catch(() => {})
      toast.success("Convite criado e link copiado para a área de transferência")
      setInviteEmail("")
      setInviteScope("client")
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

  async function updateMember(memberId: string, role: "member" | "admin", scope: "client" | "agency") {
    setSavingMemberId(memberId)
    try {
      const res = await fetch(`/api/clients/${clientId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, scope }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro")
      toast.success("Permissões atualizadas")
      setEditingMemberId(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSavingMemberId(null)
    }
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
              onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
              className="w-full h-8 rounded border bg-background px-2 text-sm"
            >
              <option value="member">Membro (acesso ao cliente)</option>
              <option value="admin">Admin (mesmas permissões do owner, exceto excluir cliente)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Escopo</Label>
            <select
              value={inviteScope}
              onChange={(e) => setInviteScope(e.target.value as "client" | "agency")}
              className="w-full h-8 rounded border bg-background px-2 text-sm"
            >
              <option value="client">Apenas este cliente</option>
              <option value="agency">Agência — todos os clientes do owner</option>
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
            {members.map((m) => {
              const isEditing = editingMemberId === m.id
              const saving = savingMemberId === m.id
              return (
                <div key={m.id} className="rounded-lg border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {m.userImage ? (
                        <img src={m.userImage} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {m.userName?.charAt(0).toUpperCase() ?? "?"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.userName}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.userEmail}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Membro"}
                      </span>
                      {m.role !== "owner" && (
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-xs",
                          m.scope === "agency" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {m.scope === "agency" ? "Agência" : "Cliente"}
                        </span>
                      )}
                      {canManage && m.role !== "owner" && !isEditing && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => setEditingMemberId(m.id)} className="h-7 w-7" title="Editar permissões">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => removeMember(m.id, m.userName)} className="text-destructive hover:text-destructive h-7 w-7" title="Remover">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <MemberEditRow
                      initialRole={m.role === "admin" ? "admin" : "member"}
                      initialScope={m.scope === "agency" ? "agency" : "client"}
                      saving={saving}
                      onCancel={() => setEditingMemberId(null)}
                      onSave={(role, scope) => updateMember(m.id, role, scope)}
                    />
                  )}
                </div>
              )
            })}
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
                          {inv.role === "admin" ? "Admin" : "Membro"}
                          {inv.scope === "agency" ? " · Agência" : ""}
                          {" · expira "}{new Date(inv.expiresAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 items-center gap-1">
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

// Notion accepts a page ID as either a 32-char hex blob or a UUID with
// dashes. The "Copy link" UI gives a URL like
// .../Some-Title-{32hex}?v=… — we extract the 32hex (and dash-format
// it for clarity, since both work with the API).
function extractNotionPageId(input: string): string {
  const trimmed = input.trim()
  // 32-hex no dashes
  const hexMatch = trimmed.match(/[0-9a-f]{32}/i)
  if (hexMatch) {
    const h = hexMatch[0].toLowerCase()
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }
  // UUID with dashes
  const uuidMatch = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  if (uuidMatch) return uuidMatch[0].toLowerCase()
  return trimmed
}

const STARTER_TEMPLATE = `Olá {{1}}, você tem 1 post aguardando sua aprovação:

📝 *{{2}}*

Aprovar ou pedir alterações:
{{3}}`

function ApprovalPanel({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [calendarPath, setCalendarPath] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [flowNs, setFlowNs] = useState("")
  // Track originals to know if anything is dirty.
  const [origApiKey, setOrigApiKey] = useState("")
  const [origFlowNs, setOrigFlowNs] = useState("")
  // Test-dispatch panel state.
  const [testPageId, setTestPageId] = useState("")
  const [testConnectionId, setTestConnectionId] = useState("")
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [connections, setConnections] = useState<Array<{ id: string; workspaceName: string; databaseName: string | null }>>([])
  // Validate-token state.
  const [validating, setValidating] = useState(false)
  const [validateResult, setValidateResult] = useState<any>(null)
  // Toggle for the Meta template + Flow setup instructions block.
  const [showFlowGuide, setShowFlowGuide] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/approval-config`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao carregar config de aprovação")
        return
      }
      setCalendarPath(data.calendarPath ?? "")
      setApiKey(data.manychatApiKey ?? "")
      setFlowNs(data.manychatApprovalFlowNs ?? "")
      setOrigApiKey(data.manychatApiKey ?? "")
      setOrigFlowNs(data.manychatApprovalFlowNs ?? "")
      const conns = Array.isArray(data.connections) ? data.connections : []
      setConnections(conns)
      // Pre-select the only connection if there's just one — saves a click.
      if (conns.length === 1) setTestConnectionId(conns[0].id)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [clientId])

  function copyCalendarUrl() {
    if (!calendarPath) return
    const url = `${window.location.origin}${calendarPath}`
    navigator.clipboard.writeText(url).then(() => toast.success("Link copiado"))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manychatApiKey: apiKey.trim() || null,
          manychatApprovalFlowNs: flowNs.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Erro ao salvar")
      }
      toast.success("ManyChat configurado")
      setOrigApiKey(apiKey.trim())
      setOrigFlowNs(flowNs.trim())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSaving(false)
    }
  }

  const dirty = apiKey.trim() !== origApiKey || flowNs.trim() !== origFlowNs

  async function validateToken() {
    if (!apiKey.trim()) {
      toast.error("Cole a API key primeiro")
      return
    }
    setValidating(true)
    setValidateResult(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/manychat-validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      const data = await res.json()
      setValidateResult(data)
      if (data.ok) toast.success(`Conectado: ${data.page?.name ?? "página ManyChat"}`)
      else toast.error(`ManyChat rejeitou: ${data.reason}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro de rede")
    } finally {
      setValidating(false)
    }
  }

  async function runTest(dispatch: boolean) {
    const pageId = extractNotionPageId(testPageId)
    if (!pageId || !testConnectionId) {
      toast.error("Preencha pageId + escolha o workspace")
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch("/api/admin/test-approval-sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId,
          connectionId: testConnectionId,
          dispatch,
        }),
      })
      const data = await res.json()
      setTestResult(data)
      if (!res.ok) toast.error(data.error ?? "Teste falhou — veja o resultado abaixo")
      else if (dispatch && !data.ok) toast.warning("Token criado, mas ManyChat falhou — veja resultado")
      else toast.success(dispatch ? "ManyChat disparado" : "Token criado — abra wa.me abaixo")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro de rede")
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Aprovação do cliente</p>
        <p className="text-xs text-muted-foreground">
          Toda vez que um post entrar no status &quot;aguardando aprovação&quot; (configurado em <a href="/settings" className="underline">/settings</a>), o app dispara um link de aprovação por WhatsApp via ManyChat. O cliente também pode acessar o calendário inteiro pelo link permanente abaixo.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Link permanente do calendário</Label>
            <p className="text-xs text-muted-foreground">
              Mande este link uma vez para {clientName} no WhatsApp. O cliente vê pendentes de aprovação, agendados e publicados — sem precisar logar.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={typeof window !== "undefined" && calendarPath ? `${window.location.origin}${calendarPath}` : calendarPath}
                className="font-mono text-xs"
              />
              <Button variant="outline" size="sm" onClick={copyCalendarUrl} disabled={!calendarPath}>
                <Copy className="h-3.5 w-3.5" />
                Copiar
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">ManyChat API Key (token da página)</Label>
            <p className="text-xs text-muted-foreground">
              Settings → API → Your API Key na conta ManyChat de {clientName}. ManyChat não suporta OAuth — é um token por página.
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="123456:abcdef..."
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setValidateResult(null) }}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={validateToken} disabled={validating || !apiKey.trim()}>
                {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Validar
              </Button>
            </div>
            {validateResult && (
              <div className={cn(
                "rounded border px-2 py-1.5 text-xs",
                validateResult.ok ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"
              )}>
                {validateResult.ok ? (
                  <span>
                    Token válido — conectado a <strong>{validateResult.page?.name ?? "página"}</strong>
                    {validateResult.page?.timezone ? ` (${validateResult.page.timezone})` : ""}
                  </span>
                ) : (
                  <span>Falhou: {validateResult.reason}</span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Flow Namespace de aprovação</Label>
            <p className="text-xs text-muted-foreground">
              No ManyChat, crie um Flow que use o template do WhatsApp aprovado pela Meta (criado na sua Meta Business Manager → WhatsApp Manager). O Flow injeta as variáveis dinâmicas — inclua <code className="rounded bg-muted px-1 font-mono text-[10px]">approval_url</code> e <code className="rounded bg-muted px-1 font-mono text-[10px]">post_title</code> como custom fields. Depois copie o namespace do Flow (ex.: <code className="rounded bg-muted px-1 font-mono text-[10px]">content20240501123456_abc123</code>).
            </p>
            <Input
              placeholder="content20240501123456_abc123"
              value={flowNs}
              onChange={(e) => setFlowNs(e.target.value)}
            />
          </div>

          <Button onClick={save} disabled={saving || !dirty} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar ManyChat
          </Button>

          <div className="rounded-lg border bg-muted/10">
            <button
              onClick={() => setShowFlowGuide((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/20"
            >
              <span>📋 Como criar o Flow + template Meta-aprovado</span>
              <span className="text-xs text-muted-foreground">{showFlowGuide ? "ocultar" : "ver passo a passo"}</span>
            </button>
            {showFlowGuide && (
              <div className="space-y-3 border-t px-3 py-3 text-xs">
                <div>
                  <p className="font-semibold">1. Criar template no Meta WhatsApp Manager</p>
                  <p className="text-muted-foreground">
                    Em <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" className="underline">business.facebook.com → Mensagens → Modelos</a>, crie um template categoria <strong>Utilidade</strong>. Cole o texto abaixo (Meta aprova em até 24h):
                  </p>
                  <div className="mt-1.5 flex items-stretch gap-1.5">
                    <pre className="flex-1 overflow-x-auto rounded border bg-background p-2 font-mono text-[11px] whitespace-pre-wrap">{STARTER_TEMPLATE}</pre>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(STARTER_TEMPLATE)
                        toast.success("Template copiado")
                      }}
                      className="shrink-0"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Variáveis: <strong>{"{{1}}"}</strong> = nome do contato, <strong>{"{{2}}"}</strong> = título do post, <strong>{"{{3}}"}</strong> = link de aprovação.
                  </p>
                </div>

                <div>
                  <p className="font-semibold">2. Criar custom fields no ManyChat</p>
                  <p className="text-muted-foreground">
                    Settings → Audience → Custom User Fields → New. Crie 4 campos do tipo <strong>Text</strong> (case-sensitive):
                  </p>
                  <ul className="mt-1 ml-4 list-disc space-y-0.5 font-mono text-[11px]">
                    <li>approval_url</li>
                    <li>post_title</li>
                    <li>contact_name</li>
                    <li>post_url</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold">3. Criar o Flow no ManyChat</p>
                  <ol className="ml-4 list-decimal space-y-0.5 text-muted-foreground">
                    <li>Automation → New Flow → escolha o canal <strong>WhatsApp</strong>.</li>
                    <li>Adicione um bloco <strong>Send Message Template</strong> (não Free Form).</li>
                    <li>Selecione o template aprovado pela Meta.</li>
                    <li>Mapeie as variáveis: {"{{1}}"} → <code className="rounded bg-muted px-1 font-mono">contact_name</code>, {"{{2}}"} → <code className="rounded bg-muted px-1 font-mono">post_title</code>, {"{{3}}"} → <code className="rounded bg-muted px-1 font-mono">approval_url</code>.</li>
                    <li>Salve. Clique em ⋯ → <strong>Get API Reference</strong> → copie o <code className="rounded bg-muted px-1 font-mono">flow_ns</code> e cole acima.</li>
                  </ol>
                </div>

                <div className="rounded border border-warning/30 bg-warning/5 p-2 text-warning">
                  <p className="font-semibold">⚠ Pré-requisito do WhatsApp Business</p>
                  <p className="text-foreground/80">
                    O cliente final precisa ter conversado com a página antes (mesmo que uma mensagem só). Sem isso, a Meta bloqueia o template — só números <em>opted-in</em> recebem.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-dashed bg-muted/20 p-3 space-y-3">
            <div>
              <p className="text-sm font-semibold">Testar dispatch (debug)</p>
              <p className="text-xs text-muted-foreground">
                Roda o sweep manualmente pra UM post (sem esperar o cron de 5 min). Pega o pageId no Notion: clique &quot;⋯&quot; → Copiar link → cole, e a parte depois do título (32 hex) é o pageId.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Workspace</Label>
              {connections.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum Notion conectado para este cliente.</p>
              ) : (
                <select
                  value={testConnectionId}
                  onChange={(e) => setTestConnectionId(e.target.value)}
                  className="w-full h-8 rounded border bg-background px-2 text-sm"
                >
                  <option value="">— Escolher workspace —</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.workspaceName}{c.databaseName ? ` (${c.databaseName})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">URL ou pageId do Notion</Label>
              <Input
                placeholder="Cole a URL do post (⋯ → Copiar link no Notion) ou o pageId direto"
                value={testPageId}
                onChange={(e) => {
                  // Auto-strip the URL to just the pageId so the agency
                  // can paste raw Notion links without thinking.
                  const next = e.target.value
                  setTestPageId(next.includes("notion.so") ? extractNotionPageId(next) : next)
                }}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => runTest(false)} disabled={testing || !testPageId.trim() || !testConnectionId}>
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Dry-run (só gera token)
              </Button>
              <Button size="sm" onClick={() => runTest(true)} disabled={testing || !testPageId.trim() || !testConnectionId}>
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                Disparar ManyChat
              </Button>
            </div>

            {testResult && (
              <div className="space-y-2 rounded border bg-background p-2">
                {testResult.error && (
                  <p className="text-xs text-destructive break-words">
                    <strong>Erro:</strong> {String(testResult.error)}
                  </p>
                )}
                {testResult.contact && testResult.contact.resolved !== false && (
                  <div className="text-xs">
                    <p className="font-medium">Contato resolvido:</p>
                    <p className="text-muted-foreground">
                      {testResult.contact.name ?? "(sem nome)"} · {testResult.contact.email ?? "(sem email)"} · {testResult.contact.phone ?? "(sem telefone)"}
                    </p>
                  </div>
                )}
                {testResult.approvalLink && (
                  <div className="text-xs space-y-1">
                    <p className="font-medium">
                      Token {testResult.approvalLink.reused ? "(reaproveitado — já existia pendente)" : "(novo)"}:
                    </p>
                    <a
                      href={testResult.approvalLink.approvalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all font-mono text-[11px] text-primary underline"
                    >
                      {testResult.approvalLink.approvalUrl}
                    </a>
                  </div>
                )}
                {testResult.waClickToChat && (
                  <a
                    href={testResult.waClickToChat}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md bg-success/15 px-2.5 py-1 text-xs font-medium text-success hover:bg-success/25"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Abrir wa.me (mandar pelo seu WhatsApp)
                  </a>
                )}
                {testResult.manychat && (
                  <div className="text-xs">
                    <p className="font-medium">ManyChat:</p>
                    <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[10px]">
{JSON.stringify(testResult.manychat.result, null, 2)}
                    </pre>
                  </div>
                )}
                {testResult.hint && (
                  <p className="text-xs italic text-muted-foreground">{testResult.hint}</p>
                )}
              </div>
            )}
          </div>

          <ApprovalHistory clientId={clientId} />
        </>
      )}
    </div>
  )
}

// Histórico de aprovações — fetches /api/clients/[id]/approvals on demand
// (collapsed by default to keep the panel scannable). Renders 4 buckets:
// pending (highlighting stale ones), decided (last 30d, with the client's
// comment inline), expired. Owner-only — the endpoint enforces and the
// caller (ApprovalPanel) is already gated by isOwner upstream.

type ApprovalRow = {
  id: string
  token: string
  notionPageId: string
  connectionId: string | null
  postTitle: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  sentVia: string | null
  sentAt: string | null
  decision: "approved" | "rejected" | "revision" | null
  decidedAt: string | null
  comment: string | null
  expiresAt: string
  createdAt: string
}

function ApprovalHistory({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{
    pending: ApprovalRow[]
    stale: ApprovalRow[]
    decided: ApprovalRow[]
    expired: ApprovalRow[]
    counts: { pending: number; stale: number; decided: number; expired: number }
  } | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/approvals`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar histórico")
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !data && !loading) load()
  }

  // Stale rows are a subset of pending — render them in the pending list
  // with a warning border instead of a separate section. Saves vertical space.
  const staleIds = new Set(data?.stale.map((r) => r.id) ?? [])

  return (
    <div className="rounded-lg border bg-muted/10">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/20"
      >
        <span className="flex items-center gap-2">
          📜 Histórico de aprovações
          {data && (
            <span className="text-[11px] font-normal text-muted-foreground">
              · {data.counts.pending} pendente{data.counts.pending !== 1 ? "s" : ""}
              {data.counts.stale > 0 && <span className="text-warning"> ({data.counts.stale} parado{data.counts.stale > 1 ? "s" : ""})</span>}
              {" · "}{data.counts.decided} decidido{data.counts.decided !== 1 ? "s" : ""}
              {data.counts.expired > 0 && <> · {data.counts.expired} expirado{data.counts.expired > 1 ? "s" : ""}</>}
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{open ? "ocultar" : "ver"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t px-3 py-3 text-xs">
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          {data && !loading && (
            <>
              {data.pending.length === 0 && data.decided.length === 0 && data.expired.length === 0 && (
                <p className="text-muted-foreground">
                  Nenhum link de aprovação criado para este cliente nos últimos 30 dias.
                </p>
              )}

              {data.pending.length > 0 && (
                <ApprovalHistorySection
                  title="Pendentes"
                  rows={data.pending}
                  staleIds={staleIds}
                  tone="pending"
                />
              )}
              {data.decided.length > 0 && (
                <ApprovalHistorySection
                  title="Decididos (últimos 30 dias)"
                  rows={data.decided}
                  staleIds={staleIds}
                  tone="decided"
                />
              )}
              {data.expired.length > 0 && (
                <ApprovalHistorySection
                  title="Expirados sem resposta"
                  rows={data.expired}
                  staleIds={staleIds}
                  tone="expired"
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ApprovalHistorySection({
  title,
  rows,
  staleIds,
  tone,
}: {
  title: string
  rows: ApprovalRow[]
  staleIds: Set<string>
  tone: "pending" | "decided" | "expired"
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title} ({rows.length})
      </p>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const isStale = staleIds.has(r.id)
          const decisionLabel = r.decision === "approved" ? "Aprovado"
            : r.decision === "rejected" ? "Rejeitado"
            : r.decision === "revision" ? "Pediu alterações"
            : null
          const decisionTone = r.decision === "approved" ? "bg-success/15 text-success"
            : r.decision === "rejected" ? "bg-destructive/15 text-destructive"
            : "bg-warning/15 text-warning"
          return (
            <li
              key={r.id}
              className={cn(
                "rounded border bg-background px-2 py-1.5",
                tone === "pending" && isStale && "border-warning/50",
                tone === "expired" && "border-destructive/30 bg-destructive/5",
                tone === "decided" && r.decision === "approved" && "border-success/30",
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-medium">{r.postTitle || "Sem título"}</span>
                {r.contactName && <span className="text-muted-foreground">· {r.contactName}</span>}
                {decisionLabel && (
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", decisionTone)}>
                    {decisionLabel}
                  </span>
                )}
                {tone === "pending" && isStale && (
                  <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                    Parado +3d
                  </span>
                )}
                {r.sentVia === "none" && tone === "pending" && (
                  <span className="text-[10px] text-warning">WA não foi enviado auto</span>
                )}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {tone === "decided" && r.decidedAt
                    ? new Date(r.decidedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                    : new Date(r.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {r.comment && (
                <p className="mt-1 break-words text-[11px] text-muted-foreground italic">
                  &quot;{r.comment}&quot;
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                <a
                  href={`/approve/${r.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:no-underline"
                >
                  abrir link
                </a>
                {r.contactPhone && (
                  <a
                    href={`https://wa.me/${r.contactPhone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:no-underline"
                  >
                    wa.me
                  </a>
                )}
                {r.notionPageId && (
                  <a
                    href={`https://www.notion.so/${r.notionPageId.replace(/-/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground underline hover:no-underline"
                  >
                    Notion
                  </a>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function MemberEditRow({
  initialRole,
  initialScope,
  saving,
  onSave,
  onCancel,
}: {
  initialRole: "member" | "admin"
  initialScope: "client" | "agency"
  saving: boolean
  onSave: (role: "member" | "admin", scope: "client" | "agency") => void
  onCancel: () => void
}) {
  const [role, setRole] = useState<"member" | "admin">(initialRole)
  const [scope, setScope] = useState<"client" | "agency">(initialScope)
  const dirty = role !== initialRole || scope !== initialScope
  return (
    <div className="mt-3 grid gap-2 rounded-md bg-muted/30 p-2 sm:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-xs">Papel</Label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "member" | "admin")}
          className="w-full h-8 rounded border bg-background px-2 text-sm"
        >
          <option value="member">Membro</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Escopo</Label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "client" | "agency")}
          className="w-full h-8 rounded border bg-background px-2 text-sm"
        >
          <option value="client">Apenas este cliente</option>
          <option value="agency">Agência (todos os clientes do owner)</option>
        </select>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" onClick={() => onSave(role, scope)} disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Salvar
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
