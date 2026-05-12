"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Building2, Check, Loader2, Plus, Trash2, Pencil, X, Users, Mail, Copy, MessageCircle, Tag, RefreshCw, ListChecks, Pause, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// Per-client config panels rendered inline on /settings (extracted
// from /clients in #67 because Next.js 15 page files cannot have
// named exports). Self-contained — each panel takes only primitive
// props and manages its own state.

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


export function MembersPanel({ clientId, canManage }: { clientId: string; canManage: boolean }) {
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
        <p className="text-base font-semibold">Membros ({members.length})</p>
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
            <Label className="text-sm">Email do convidado</Label>
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
            <Label className="text-sm">Papel</Label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
              className="w-full h-8 rounded border bg-background px-2 text-base"
            >
              <option value="member">Membro (acesso ao cliente)</option>
              <option value="admin">Admin (mesmas permissões do owner, exceto excluir cliente)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Escopo</Label>
            <select
              value={inviteScope}
              onChange={(e) => setInviteScope(e.target.value as "client" | "agency")}
              className="w-full h-8 rounded border bg-background px-2 text-base"
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
          <p className="text-sm text-muted-foreground">
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
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {m.userName?.charAt(0).toUpperCase() ?? "?"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-base font-medium truncate">{m.userName}</p>
                        <p className="text-sm text-muted-foreground truncate">{m.userEmail}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground">
                        {m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Membro"}
                      </span>
                      {m.role !== "owner" && (
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-sm",
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
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground pt-2">Convites pendentes</p>
              <div className="space-y-1.5">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-base font-medium truncate">{inv.email}</p>
                        <p className="text-sm text-muted-foreground">
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

type ConnectionStatus = {
  id: string
  workspaceName: string
  databaseName: string | null
  notionReady: boolean
  missingNotionFields: string[]
}

export function ApprovalPanel({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [calendarPath, setCalendarPath] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [flowNs, setFlowNs] = useState("")
  const [mode, setMode] = useState<"auto_manychat" | "manual_whatsapp">("auto_manychat")
  const [dispatchMode, setDispatchMode] = useState<"auto" | "manual">("auto")
  const [origDispatchMode, setOrigDispatchMode] = useState<"auto" | "manual">("auto")
  const [waTemplate, setWaTemplate] = useState("")
  const [origWaTemplate, setOrigWaTemplate] = useState("")
  // Track originals to know if anything is dirty.
  const [origApiKey, setOrigApiKey] = useState("")
  const [origFlowNs, setOrigFlowNs] = useState("")
  const [origMode, setOrigMode] = useState<"auto_manychat" | "manual_whatsapp">("auto_manychat")
  // Test-dispatch panel state.
  const [testPageId, setTestPageId] = useState("")
  const [testConnectionId, setTestConnectionId] = useState("")
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [connections, setConnections] = useState<ConnectionStatus[]>([])
  const [status, setStatus] = useState<"configured" | "partial" | "missing" | null>(null)
  const [nextStepHint, setNextStepHint] = useState<string | null>(null)
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
      const nextMode = (data.approvalNotificationMode === "manual_whatsapp"
        ? "manual_whatsapp"
        : "auto_manychat") as "auto_manychat" | "manual_whatsapp"
      setMode(nextMode)
      setOrigMode(nextMode)
      const nextDispatch = (data.approvalDispatchMode === "manual" ? "manual" : "auto") as "auto" | "manual"
      setDispatchMode(nextDispatch)
      setOrigDispatchMode(nextDispatch)
      const tpl = typeof data.manualWhatsappTemplate === "string" ? data.manualWhatsappTemplate : ""
      setWaTemplate(tpl)
      setOrigWaTemplate(tpl)
      const conns: ConnectionStatus[] = Array.isArray(data.connections) ? data.connections : []
      setConnections(conns)
      setStatus(typeof data.status === "string" ? data.status : null)
      setNextStepHint(typeof data.nextStepHint === "string" ? data.nextStepHint : null)
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
          approvalNotificationMode: mode,
          approvalDispatchMode: dispatchMode,
          manualWhatsappTemplate: waTemplate,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Erro ao salvar")
      }
      toast.success("Configuração salva")
      setOrigApiKey(apiKey.trim())
      setOrigFlowNs(flowNs.trim())
      setOrigMode(mode)
      setOrigDispatchMode(dispatchMode)
      setOrigWaTemplate(waTemplate)
      // Re-fetch so the status pill + hints reflect the saved state
      // without a full page reload.
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    apiKey.trim() !== origApiKey ||
    flowNs.trim() !== origFlowNs ||
    mode !== origMode ||
    dispatchMode !== origDispatchMode ||
    waTemplate !== origWaTemplate

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
        <p className="text-base font-semibold">Aprovação do cliente</p>
        <p className="text-sm text-muted-foreground">
          Toda vez que um post entrar no status &quot;aguardando aprovação&quot; (configurado em <a href="/settings" className="underline">/settings</a>), o app gera um link <code className="rounded bg-muted px-1 font-mono text-[12px]">/approve/&lt;token&gt;</code> e avisa o cliente conforme o modo escolhido abaixo.
        </p>
      </div>

      {!loading && status && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
            status === "configured" && "border-success/30 bg-success/5",
            status === "partial" && "border-warning/30 bg-warning/5",
            status === "missing" && "border-muted-foreground/20 bg-muted/30",
          )}
        >
          <span
            className={cn(
              "mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full",
              status === "configured" && "bg-success",
              status === "partial" && "bg-warning",
              status === "missing" && "bg-muted-foreground/40",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {status === "configured" && "Configurada"}
              {status === "partial" && "Parcialmente configurada"}
              {status === "missing" && "Não configurada"}
            </p>
            {nextStepHint && (
              <p className="mt-0.5 text-muted-foreground">{nextStepHint}</p>
            )}
            {connections.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {connections.map((c) => (
                  <li key={c.id} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-block h-1.5 w-1.5 rounded-full",
                        c.notionReady ? "bg-success" : "bg-warning",
                      )}
                    />
                    <span className="text-[13px] text-muted-foreground">
                      <strong className="text-foreground">{c.workspaceName}</strong>
                      {c.databaseName ? ` (${c.databaseName})` : ""}
                      {c.notionReady
                        ? " — campos do Notion OK"
                        : ` — falta: ${c.missingNotionFields.slice(0, 2).join(", ")}${c.missingNotionFields.length > 2 ? "…" : ""}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-sm">Link permanente do calendário</Label>
            <p className="text-sm text-muted-foreground">
              Mande este link uma vez para {clientName} no WhatsApp. O cliente vê pendentes de aprovação, agendados e publicados — sem precisar logar.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={typeof window !== "undefined" && calendarPath ? `${window.location.origin}${calendarPath}` : calendarPath}
                className="font-mono text-sm"
              />
              <Button variant="outline" size="sm" onClick={copyCalendarUrl} disabled={!calendarPath}>
                <Copy className="h-3.5 w-3.5" />
                Copiar
              </Button>
            </div>
          </div>

          {/* Notification mode selector — drives whether the cron tries
              ManyChat or just generates the link for manual wa.me share. */}
          <div className="space-y-1.5">
            <Label className="text-sm">Como avisar o cliente</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label
                className={cn(
                  "cursor-pointer rounded-lg border p-3 text-sm transition-colors",
                  mode === "auto_manychat"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-accent",
                )}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`approval-mode-${clientId}`}
                    value="auto_manychat"
                    checked={mode === "auto_manychat"}
                    onChange={() => setMode("auto_manychat")}
                    className="h-3.5 w-3.5"
                  />
                  <span className="font-medium">Automático via ManyChat</span>
                </div>
                <p className="mt-1 ml-5 text-muted-foreground">
                  O cron dispara WhatsApp pelo ManyChat assim que um post entra em &quot;aguardando&quot;. Requer token + Flow do ManyChat.
                </p>
              </label>
              <label
                className={cn(
                  "cursor-pointer rounded-lg border p-3 text-sm transition-colors",
                  mode === "manual_whatsapp"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-accent",
                )}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`approval-mode-${clientId}`}
                    value="manual_whatsapp"
                    checked={mode === "manual_whatsapp"}
                    onChange={() => setMode("manual_whatsapp")}
                    className="h-3.5 w-3.5"
                  />
                  <span className="font-medium">Manual via wa.me</span>
                </div>
                <p className="mt-1 ml-5 text-muted-foreground">
                  Sem ManyChat. O app gera o link e você envia pelo seu WhatsApp clicando &quot;Enviar via WA&quot; em /scheduled.
                </p>
              </label>
            </div>
          </div>

          {/* Dispatch timing — when the WhatsApp goes out. Independent
              from the notification-mode radio above. Defaults to auto
              for backward compat; user picks manual to stop the cron
              spam and trigger a digest manually from /dashboard. */}
          <div className="space-y-1.5">
            <Label className="text-sm">Quando enviar o WhatsApp</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label
                className={cn(
                  "cursor-pointer rounded-lg border p-3 text-sm transition-colors",
                  dispatchMode === "auto"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-accent",
                )}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`approval-dispatch-${clientId}`}
                    value="auto"
                    checked={dispatchMode === "auto"}
                    onChange={() => setDispatchMode("auto")}
                    className="h-3.5 w-3.5"
                  />
                  <span className="font-medium">Automático</span>
                </div>
                <p className="mt-1 ml-5 text-muted-foreground">
                  Cron dispara um WhatsApp pra cada post que entrar em &quot;aguardando aprovação&quot;.
                </p>
              </label>
              <label
                className={cn(
                  "cursor-pointer rounded-lg border p-3 text-sm transition-colors",
                  dispatchMode === "manual"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-accent",
                )}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`approval-dispatch-${clientId}`}
                    value="manual"
                    checked={dispatchMode === "manual"}
                    onChange={() => setDispatchMode("manual")}
                    className="h-3.5 w-3.5"
                  />
                  <span className="font-medium">Manual (eu disparo no /dashboard)</span>
                </div>
                <p className="mt-1 ml-5 text-muted-foreground">
                  Cron cria os links mas não envia. Você clica <strong>&quot;Notificar pendentes&quot;</strong> no /dashboard pra mandar um WhatsApp resumo quando achar melhor.
                </p>
              </label>
            </div>
          </div>

          {mode === "manual_whatsapp" && (
            <>
              <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm">
                <p className="font-medium text-success">Modo manual ativo</p>
                <p className="mt-1 text-foreground/80">
                  Configure só os campos do Notion em <a href="/settings" className="underline">/settings</a>. Quando um post entrar em &quot;aguardando aprovação&quot;, ele aparece em <a href="/scheduled" className="underline">/scheduled</a> com um botão <strong>Enviar via WA</strong> que abre o wa.me com a mensagem pronta.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Mensagem padrão do WhatsApp (opcional)</Label>
                <p className="text-sm text-muted-foreground">
                  Texto que aparece pré-preenchido no botão &quot;Enviar via WA&quot;. Suporta os placeholders <code className="rounded bg-muted px-1 font-mono text-[12px]">{"{{contact_name}}"}</code>, <code className="rounded bg-muted px-1 font-mono text-[12px]">{"{{post_title}}"}</code>, <code className="rounded bg-muted px-1 font-mono text-[12px]">{"{{approval_url}}"}</code>, <code className="rounded bg-muted px-1 font-mono text-[12px]">{"{{client_name}}"}</code>. Em branco = mensagem padrão simples.
                </p>
                <textarea
                  value={waTemplate}
                  onChange={(e) => setWaTemplate(e.target.value)}
                  placeholder={`Olá {{contact_name}}!\n\nA ${clientName} preparou um post pra você revisar:\n*{{post_title}}*\n\nClique aqui pra aprovar ou pedir alterações:\n{{approval_url}}`}
                  rows={6}
                  className="w-full rounded border bg-background p-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <Button onClick={save} disabled={saving || !dirty} size="sm">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Salvar mensagem
              </Button>
            </>
          )}

          {mode === "auto_manychat" && (
          <>
          <div className="space-y-1.5">
            <Label className="text-sm">ManyChat API Key (token da página)</Label>
            <p className="text-sm text-muted-foreground">
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
                "rounded border px-2 py-1.5 text-sm",
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
            <Label className="text-sm">Flow de aprovação</Label>
            <p className="text-sm text-muted-foreground">
              No ManyChat, crie um Flow que use o template do WhatsApp aprovado pela Meta (criado na sua Meta Business Manager → WhatsApp Manager). O Flow injeta as variáveis dinâmicas — inclua <code className="rounded bg-muted px-1 font-mono text-[12px]">approval_url</code> e <code className="rounded bg-muted px-1 font-mono text-[12px]">post_title</code> como custom fields. Depois clique em <em>Carregar Flows</em> abaixo pra escolher.
            </p>
            <FlowPicker
              clientId={clientId}
              apiKey={apiKey}
              value={flowNs}
              onChange={setFlowNs}
            />
          </div>

          <Button onClick={save} disabled={saving || !dirty} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar ManyChat
          </Button>

          {/* Self-test dispatch — sends the configured Flow to a phone
              the agency picks (typically their own) so they can confirm
              the whole pipeline works before going live. Only useful
              when the API key + Flow are saved and persisted. */}
          {!dirty && origApiKey && origFlowNs && (
            <>
              <SelfTestPanel clientId={clientId} />
              <ContactDebugButton clientId={clientId} />
              <ManyChatDebugButton clientId={clientId} />
            </>
          )}

          <div className="rounded-lg border bg-muted/10">
            <button
              onClick={() => setShowFlowGuide((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-base font-medium hover:bg-muted/20"
            >
              <span>📋 Como criar o Flow + template Meta-aprovado</span>
              <span className="text-sm text-muted-foreground">{showFlowGuide ? "ocultar" : "ver passo a passo"}</span>
            </button>
            {showFlowGuide && (
              <div className="space-y-3 border-t px-3 py-3 text-sm">
                <div>
                  <p className="font-semibold">1. Criar template no Meta WhatsApp Manager</p>
                  <p className="text-muted-foreground">
                    Em <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" className="underline">business.facebook.com → Mensagens → Modelos</a>, crie um template categoria <strong>Utilidade</strong>. Cole o texto abaixo (Meta aprova em até 24h):
                  </p>
                  <div className="mt-1.5 flex items-stretch gap-1.5">
                    <pre className="flex-1 overflow-x-auto rounded border bg-background p-2 font-mono text-[13px] whitespace-pre-wrap">{STARTER_TEMPLATE}</pre>
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
                    Settings → Audience → Custom User Fields → New. Crie 3 campos do tipo <strong>Text</strong> (case-sensitive):
                  </p>
                  <ul className="mt-1 ml-4 list-disc space-y-0.5 font-mono text-[13px]">
                    <li>approval_url</li>
                    <li>post_title</li>
                    <li>post_url</li>
                  </ul>
                  <p className="mt-2 text-muted-foreground">
                    <strong>Pro nome do destinatário</strong>, use a variável <strong>nativa</strong> do ManyChat <code className="rounded bg-muted px-1 font-mono text-[13px]">{"{{Primeiro Nome}}"}</code> (System Field → First Name) direto no template — ela já vem preenchida do perfil WhatsApp, sem precisar criar custom field.
                  </p>
                </div>

                <div>
                  <p className="font-semibold">3. Criar o Flow no ManyChat</p>
                  <ol className="ml-4 list-decimal space-y-0.5 text-muted-foreground">
                    <li>Automation → New Flow → escolha o canal <strong>WhatsApp</strong>.</li>
                    <li>Adicione um bloco <strong>Send Message Template</strong> (não Free Form).</li>
                    <li>Selecione o template aprovado pela Meta.</li>
                    <li>Mapeie as variáveis: {"{{1}}"} → <code className="rounded bg-muted px-1 font-mono">{"{{Primeiro Nome}}"}</code> (System Field), {"{{2}}"} → <code className="rounded bg-muted px-1 font-mono">post_title</code>, {"{{3}}"} → <code className="rounded bg-muted px-1 font-mono">approval_url</code>.</li>
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
              <p className="text-base font-semibold">Testar dispatch (debug)</p>
              <p className="text-sm text-muted-foreground">
                Roda o sweep manualmente pra UM post (sem esperar o cron de 5 min). Pega o pageId no Notion: clique &quot;⋯&quot; → Copiar link → cole, e a parte depois do título (32 hex) é o pageId.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Workspace</Label>
              {connections.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum Notion conectado para este cliente.</p>
              ) : (
                <select
                  value={testConnectionId}
                  onChange={(e) => setTestConnectionId(e.target.value)}
                  className="w-full h-8 rounded border bg-background px-2 text-base"
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
              <Label className="text-sm">URL ou pageId do Notion</Label>
              <Input
                placeholder="Cole a URL do post (⋯ → Copiar link no Notion) ou o pageId direto"
                value={testPageId}
                onChange={(e) => {
                  // Auto-strip the URL to just the pageId so the agency
                  // can paste raw Notion links without thinking.
                  const next = e.target.value
                  setTestPageId(next.includes("notion.so") ? extractNotionPageId(next) : next)
                }}
                className="font-mono text-sm"
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
                  <p className="text-sm text-destructive break-words">
                    <strong>Erro:</strong> {String(testResult.error)}
                  </p>
                )}
                {testResult.contact && testResult.contact.resolved !== false && (
                  <div className="text-sm">
                    <p className="font-medium">Contato resolvido:</p>
                    <p className="text-muted-foreground">
                      {testResult.contact.name ?? "(sem nome)"} · {testResult.contact.email ?? "(sem email)"} · {testResult.contact.phone ?? "(sem telefone)"}
                    </p>
                  </div>
                )}
                {testResult.approvalLink && (
                  <div className="text-sm space-y-1">
                    <p className="font-medium">
                      Token {testResult.approvalLink.reused ? "(reaproveitado — já existia pendente)" : "(novo)"}:
                    </p>
                    <a
                      href={testResult.approvalLink.approvalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all font-mono text-[13px] text-primary underline"
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
                    className="inline-flex items-center gap-1.5 rounded-md bg-success/15 px-2.5 py-1 text-sm font-medium text-success hover:bg-success/25"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Abrir wa.me (mandar pelo seu WhatsApp)
                  </a>
                )}
                {testResult.manychat && (
                  <div className="text-sm">
                    <p className="font-medium">ManyChat:</p>
                    <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[12px]">
{JSON.stringify(testResult.manychat.result, null, 2)}
                    </pre>
                  </div>
                )}
                {testResult.hint && (
                  <p className="text-sm italic text-muted-foreground">{testResult.hint}</p>
                )}
              </div>
            )}
          </div>
          </>
          )}

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
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-base font-medium hover:bg-muted/20"
      >
        <span className="flex items-center gap-2">
          📜 Histórico de aprovações
          {data && (
            <span className="text-[13px] font-normal text-muted-foreground">
              · {data.counts.pending} pendente{data.counts.pending !== 1 ? "s" : ""}
              {data.counts.stale > 0 && <span className="text-warning"> ({data.counts.stale} parado{data.counts.stale > 1 ? "s" : ""})</span>}
              {" · "}{data.counts.decided} decidido{data.counts.decided !== 1 ? "s" : ""}
              {data.counts.expired > 0 && <> · {data.counts.expired} expirado{data.counts.expired > 1 ? "s" : ""}</>}
            </span>
          )}
        </span>
        <span className="text-sm text-muted-foreground">{open ? "ocultar" : "ver"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t px-3 py-3 text-sm">
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
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
      <p className="mb-1.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                  <span className={cn("rounded px-1.5 py-0.5 text-[12px] font-medium", decisionTone)}>
                    {decisionLabel}
                  </span>
                )}
                {tone === "pending" && isStale && (
                  <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[12px] font-medium text-warning">
                    Parado +3d
                  </span>
                )}
                {r.sentVia === "none" && tone === "pending" && (
                  <span className="text-[12px] text-warning">WA não foi enviado auto</span>
                )}
                <span className="ml-auto font-mono text-[12px] text-muted-foreground">
                  {tone === "decided" && r.decidedAt
                    ? new Date(r.decidedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                    : new Date(r.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {r.comment && (
                <p className="mt-1 break-words text-[13px] text-muted-foreground italic">
                  &quot;{r.comment}&quot;
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-1.5 text-[12px]">
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

// Flow dropdown — fetches the user's ManyChat Flows so they pick a name
// instead of pasting a cryptic content20240501... namespace string. Falls
// back to a free-text input when:
//   - the user hasn't entered an API key yet (can't list)
//   - the saved flow_ns isn't in the fetched list (kept for legacy or
//     newly-created flows the user wants to wire by hand)
// Setup completeness checklist with one-click action links per step.
// Reduces "I forgot to configure X and now nothing publishes" mistakes
// for new clients. Also exposes the publishing-pause toggle since
// pause/resume is closely tied to "is this client live" decisions.
type SetupStep = {
  key: string
  label: string
  status: "done" | "partial" | "missing"
  action: { label: string; href: string }
  detail?: string | null
}

export function SetupChecklistPanel({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true)
  const [steps, setSteps] = useState<SetupStep[]>([])
  const [percent, setPercent] = useState(0)
  const [paused, setPaused] = useState(false)
  const [togglingPause, setTogglingPause] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/setup-status`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao carregar status")
        return
      }
      setSteps(Array.isArray(data.steps) ? data.steps : [])
      setPercent(typeof data.percentComplete === "number" ? data.percentComplete : 0)
      setPaused(data.publishingPaused === true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function togglePause() {
    setTogglingPause(true)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishingPaused: !paused }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? "Erro ao atualizar")
      }
      setPaused(!paused)
      toast.success(!paused ? "Publicações pausadas" : "Publicações retomadas")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setTogglingPause(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <p className="text-base font-semibold">Checklist de configuração</p>
      </div>

      {paused && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium text-warning">⏸ Publicações pausadas</p>
          <p className="mt-1 text-foreground/80">
            O cron está pulando este cliente — nenhum post vai ser publicado nem nenhuma aprovação vai disparar até retomar.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm text-muted-foreground">{percent}% configurado</span>
              <span className="text-[13px] text-muted-foreground">
                {steps.filter((s) => s.status === "done").length}/{steps.length} passos
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full transition-all",
                  percent === 100 ? "bg-success" : percent > 50 ? "bg-primary" : "bg-warning",
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {/* Step list */}
          <ul className="space-y-2">
            {steps.map((s) => (
              <li
                key={s.key}
                className={cn(
                  "flex items-start gap-3 rounded-md border bg-card px-3 py-2.5",
                  s.status === "done" && "border-success/30",
                  s.status === "partial" && "border-warning/30",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[13px] font-medium",
                    s.status === "done" && "bg-success/15 text-success",
                    s.status === "partial" && "bg-warning/15 text-warning",
                    s.status === "missing" && "bg-muted text-muted-foreground",
                  )}
                >
                  {s.status === "done" ? "✓" : s.status === "partial" ? "·" : "○"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium">{s.label}</p>
                  {s.detail && (
                    <p className="mt-0.5 text-[13px] text-muted-foreground">{s.detail}</p>
                  )}
                </div>
                <Button asChild size="sm" variant={s.status === "done" ? "ghost" : "outline"}>
                  <a href={s.action.href}>{s.action.label}</a>
                </Button>
              </li>
            ))}
          </ul>

          {/* Pause toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium">
                {paused ? "Retomar publicações" : "Pausar publicações"}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {paused
                  ? "O cron volta a publicar e disparar aprovações deste cliente."
                  : "O cron para de publicar e de disparar aprovações deste cliente até você retomar."}
              </p>
            </div>
            <Button
              variant={paused ? "default" : "outline"}
              size="sm"
              onClick={togglePause}
              disabled={togglingPause}
            >
              {togglingPause ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : paused ? (
                <Play className="h-3.5 w-3.5" />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}
              {paused ? "Retomar" : "Pausar"}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// Sends the saved ManyChat Flow to a phone the agency picks (usually
// their own) — confirms token + Flow + WA template are all wired
// without spamming the real client. Result includes a "subscriber not
// found" hint when applicable since that's the most common failure.
// Contact-resolution diagnostic. Walks the same path the cron uses,
// dumps every intermediate value (rollup payload shape, contact IDs
// extracted, phone fields found on the contact page, the picked
// phone + source). Surfaces "phone came from Conta page, not Contato"
// kind of bugs without requiring access to Trigger.dev worker logs.
function ContactDebugButton({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  // Posts in awaiting-approval status — populated on mount so the user
  // can pick which one to diagnose. Auto-picking the first one was
  // grabbing wrong posts.
  const [posts, setPosts] = useState<Array<{ id: string; title: string }>>([])
  const [selectedPostId, setSelectedPostId] = useState<string>("")
  const [loadingPosts, setLoadingPosts] = useState(false)

  async function loadPosts() {
    setLoadingPosts(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/debug-contact?list=1`)
      const data = await res.json()
      const list: Array<{ id: string; title: string }> = data?.posts ?? []
      setPosts(list)
      if (list.length > 0 && !selectedPostId) setSelectedPostId(list[0].id)
    } finally {
      setLoadingPosts(false)
    }
  }

  useEffect(() => {
    loadPosts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function run() {
    setLoading(true)
    setResult(null)
    try {
      const qs = selectedPostId ? `?pageId=${encodeURIComponent(selectedPostId)}` : ""
      const res = await fetch(`/api/clients/${clientId}/debug-contact${qs}`)
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-base font-semibold">Diagnosticar resolução de contato</p>
          <p className="text-sm text-muted-foreground">
            Roda a mesma resolução que o cron usa. Escolha o post que quer diagnosticar (lista todos em status &quot;aguardando aprovação&quot;).
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={loading || !selectedPostId}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Diagnosticar
        </Button>
      </div>

      {/* Post picker: user must pick which awaiting-approval post to
          diagnose. Auto-pick was grabbing wrong posts. */}
      <div className="space-y-1">
        <Label className="text-sm">Post pra diagnosticar</Label>
        {loadingPosts ? (
          <p className="text-sm text-muted-foreground">Carregando posts em status de aprovação…</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum post em status de aprovação. Marca um no Notion como &quot;aguardando aprovação&quot; e recarrega.
          </p>
        ) : (
          <select
            value={selectedPostId}
            onChange={(e) => setSelectedPostId(e.target.value)}
            className="w-full rounded-md border bg-card px-2 py-1.5 text-sm"
          >
            {posts.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        )}
        {posts.length > 0 && (
          <div className="flex items-center justify-between text-[13px] text-muted-foreground">
            <span>{posts.length} post{posts.length === 1 ? "" : "s"} em aprovação</span>
            <button onClick={loadPosts} disabled={loadingPosts} className="hover:underline">
              Recarregar lista
            </button>
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-2 rounded-md border bg-card p-3 text-sm">
          {result.error && (
            <p className="text-destructive">⚠ {result.error}</p>
          )}
          {result.pickedContact && (
            <div className={cn(
              "rounded p-2",
              result.pickedPhone ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
            )}>
              <p className="font-medium">
                {result.pickedPhone ? "✓" : "⚠"} Contato escolhido: {result.pickedContact.title ?? "(sem título)"}
              </p>
              <p className="text-[13px] opacity-80">{result.pickedReason}</p>
              {result.pickedPhone && (
                <p className="mt-1 text-[13px]">
                  Telefone: <strong className="font-mono">{result.pickedPhone.value}</strong>
                  <span className="ml-2 opacity-70">(via {result.pickedPhone.source})</span>
                </p>
              )}
              {!result.pickedPhone && (
                <p className="mt-1 text-[13px]">Sem telefone resolvido neste contato.</p>
              )}
            </div>
          )}
          {Array.isArray(result.contacts) && result.contacts.length > 0 && (
            <details className="text-[13px]">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                {result.contacts.length} contato(s) encontrado(s) — ver detalhes
              </summary>
              <ul className="mt-1.5 space-y-1.5">
                {result.contacts.map((c: any) => (
                  <li key={c.id} className="rounded bg-muted/30 p-2">
                    <p className="font-mono text-[12px] opacity-70">{c.id}</p>
                    <p className="font-medium">{c.title ?? "(sem título)"}</p>
                    {c.approverField && (
                      <p className="text-[12px]">Aprovador &quot;{c.approverField}&quot;: {c.approverChecked === true ? "✓ marcado" : c.approverChecked === false ? "○ desmarcado" : "—"}</p>
                    )}
                    {c.phoneFields && c.phoneFields.length > 0 ? (
                      <ul className="mt-1 text-[12px] font-mono">
                        {c.phoneFields.map((pf: any, i: number) => (
                          <li key={i}>{pf.name} ({pf.type}): {pf.value}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[12px] opacity-60">Sem campo telefone neste contato.</p>
                    )}
                    {c.error && <p className="text-[12px] text-destructive">{c.error}</p>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {Array.isArray(result.trace) && result.trace.length > 0 && (
            <details className="text-[12px]">
              <summary className="cursor-pointer text-muted-foreground">Trace completo (JSON)</summary>
              <pre className="mt-1.5 max-h-96 overflow-auto rounded bg-muted p-2 font-mono">{JSON.stringify(result.trace, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

// Probes the ManyChat connection: page name, phone format variants.
// Used when "Subscriber não encontrado" persists despite the agency
// being sure the contact is in ManyChat — confirms which account the
// API key targets and which phone variants ManyChat refuses.
function ManyChatDebugButton({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(false)
  const [phone, setPhone] = useState("")
  const [result, setResult] = useState<any>(null)
  const [open, setOpen] = useState(false)

  async function run() {
    setLoading(true)
    setResult(null)
    try {
      const qs = phone.trim() ? `?phone=${encodeURIComponent(phone.trim())}` : ""
      const res = await fetch(`/api/clients/${clientId}/manychat-debug${qs}`)
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-accent"
      >
        <p className="font-semibold">Diagnosticar conexão ManyChat</p>
        <p className="mt-0.5 text-muted-foreground">
          Confirma em qual conta ManyChat a API key está conectada + testa formatos de telefone (útil quando dá &quot;subscriber não encontrado&quot;).
        </p>
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-base font-semibold">Diagnosticar conexão ManyChat</p>
          <p className="text-sm text-muted-foreground">
            Confirma qual conta ManyChat a API key acessa + testa variantes do telefone.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Telefone (E.164 ou só dígitos) — opcional"
          className="flex-1"
        />
        <Button size="sm" variant="outline" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Testar
        </Button>
      </div>

      {result && (
        <div className="space-y-2 rounded-md border bg-card p-3 text-sm">
          {result.error && <p className="text-destructive">⚠ {result.error}</p>}

          {result.pageInfo && (
            <div
              className={cn(
                "rounded p-2 text-[13px]",
                result.pageInfo.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
              )}
            >
              <p className="font-medium">
                {result.pageInfo.ok ? "✓" : "⚠"} {result.pageInfo.ok ? `Conta ManyChat: ${result.pageInfo.name ?? "(sem nome)"}` : "Falha em autenticar"}
              </p>
              <p className="opacity-80">Page ID: {result.pageInfo.id ?? "—"}{result.pageInfo.timezone ? ` · ${result.pageInfo.timezone}` : ""}</p>
              <p className="opacity-70 text-[12px]">Status HTTP: {result.pageInfo.status}</p>
            </div>
          )}

          {Array.isArray(result.phoneProbes) && (
            <details>
              <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground">
                {result.phoneProbes.length} variantes testadas
              </summary>
              <ul className="mt-1.5 space-y-1 font-mono text-[12px]">
                {result.phoneProbes.map((p: any, i: number) => (
                  <li
                    key={i}
                    className={cn(
                      "rounded px-2 py-1",
                      p.status === 200 && p.body?.data?.id
                        ? "bg-success/10 text-success"
                        : "bg-muted/40",
                    )}
                  >
                    <strong>{p.variant}</strong> → {p.status} {p.body?.data?.id ? `· subscriber ${p.body.data.id}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {result.advice && (
            <div className="rounded bg-warning/10 p-2 text-[13px] text-warning">
              💡 {result.advice}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SelfTestPanel({ clientId }: { clientId: string }) {
  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; reason?: string; hint?: string | null } | null>(null)
  const [open, setOpen] = useState(false)

  async function send() {
    if (!phone.trim()) {
      toast.error("Cole seu telefone")
      return
    }
    setSending(true)
    setResult(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/test-approval-self`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), name: name.trim() || undefined }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setResult({ ok: false, reason: data?.error ?? "Erro", hint: data?.hint ?? null })
        return
      }
      setResult({ ok: true })
      toast.success("Mensagem enviada — confira seu WhatsApp")
    } catch (e) {
      setResult({ ok: false, reason: e instanceof Error ? e.message : String(e) })
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Testar com meu próprio WhatsApp
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-base font-semibold">Testar com seu WhatsApp</p>
        <button
          type="button"
          onClick={() => { setOpen(false); setResult(null) }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Fechar
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Dispara o Flow configurado pra você em vez do cliente real, com um post de teste. Confirma que ManyChat + Meta + Flow estão todos OK antes de mandar pro cliente.
      </p>
      <div className="space-y-1.5">
        <Label className="text-sm">Seu telefone (E.164)</Label>
        <Input
          type="tel"
          placeholder="+5511999999999"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="font-mono text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm">Seu nome (vai aparecer como contact_name)</Label>
        <Input
          type="text"
          placeholder="Vai usar o nome da sua conta se ficar em branco"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={send} disabled={sending || !phone.trim()}>
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
        Enviar pra mim
      </Button>
      {result && (
        <div
          className={cn(
            "rounded border px-2 py-1.5 text-sm",
            result.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {result.ok ? (
            <span>✓ Enviado. Verifique seu WhatsApp em alguns segundos.</span>
          ) : (
            <div className="space-y-1">
              <p className="font-medium">{result.reason}</p>
              {result.hint && <p className="text-foreground/80">{result.hint}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FlowPicker({
  clientId,
  apiKey,
  value,
  onChange,
}: {
  clientId: string
  apiKey: string
  value: string
  onChange: (next: string) => void
}) {
  const [flows, setFlows] = useState<Array<{ ns: string; name: string; folderName: string | null }> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/manychat-flows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() || undefined }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Erro ao listar Flows")
        return
      }
      setFlows(Array.isArray(data?.flows) ? data.flows : [])
    } finally {
      setLoading(false)
    }
  }

  const selectedInList = flows?.some((f) => f.ns === value)

  return (
    <div className="space-y-1.5">
      {flows === null ? (
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="content20240501123456_abc123"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 font-mono text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading || !apiKey.trim()}
            title={apiKey.trim() ? "Buscar Flows do ManyChat" : "Cole a API key acima primeiro"}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Carregar Flows
          </Button>
        </div>
      ) : showRaw ? (
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="content20240501123456_abc123"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 font-mono text-sm"
          />
          <Button variant="ghost" size="sm" onClick={() => setShowRaw(false)}>
            Voltar pra lista
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 flex-1 rounded border bg-background px-2 text-base"
          >
            <option value="">— Escolher Flow —</option>
            {!selectedInList && value && (
              <option value={value}>(salvo) {value.slice(0, 24)}…</option>
            )}
            {flows.map((f) => (
              <option key={f.ns} value={f.ns}>
                {f.folderName ? `${f.folderName} / ` : ""}{f.name}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} title="Atualizar lista">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowRaw(true)}>
            Colar manualmente
          </Button>
        </div>
      )}
      {error && (
        <p className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-[13px] text-destructive">
          ManyChat: {error}
        </p>
      )}
      {flows && flows.length === 0 && !error && (
        <p className="text-[13px] text-muted-foreground">
          Nenhum Flow encontrado nessa conta. Crie um Flow no ManyChat (com bloco &quot;Send Message Template&quot;) e clique em <em>Atualizar</em>.
        </p>
      )}
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
        <Label className="text-sm">Papel</Label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "member" | "admin")}
          className="w-full h-8 rounded border bg-background px-2 text-base"
        >
          <option value="member">Membro</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-sm">Escopo</Label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "client" | "agency")}
          className="w-full h-8 rounded border bg-background px-2 text-base"
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

type ContaSource = { workspaceName: string | null; dbName: string | null; accountField: string }

export function NotionContasPanel({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [available, setAvailable] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [original, setOriginal] = useState<Set<string>>(new Set())
  const [customValue, setCustomValue] = useState("")
  const [sources, setSources] = useState<ContaSource[]>([])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/notion-contas`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao carregar contas do Notion")
        return
      }
      const opts: string[] = Array.isArray(data.contas) ? data.contas : []
      const cur: string[] = Array.isArray(data.current) ? data.current : []
      // Show currently-selected values even if they're no longer in the
      // database options (e.g. user typed a value that doesn't exist
      // anymore). Avoids silently dropping.
      const merged = Array.from(new Set([...opts, ...cur])).sort((a, b) => a.localeCompare(b, "pt-BR"))
      setAvailable(merged)
      setSelected(new Set(cur))
      setOriginal(new Set(cur))
      setSources(Array.isArray(data.sources) ? data.sources : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  function toggle(value: string) {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setSelected(next)
  }

  function addCustom() {
    const trimmed = customValue.trim()
    if (!trimmed) return
    if (!available.includes(trimmed)) {
      setAvailable((prev) => [...prev, trimmed].sort((a, b) => a.localeCompare(b, "pt-BR")))
    }
    setSelected((prev) => new Set([...prev, trimmed]))
    setCustomValue("")
  }

  const dirty =
    selected.size !== original.size ||
    Array.from(selected).some((v) => !original.has(v))

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionContaValues: Array.from(selected) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? "Erro ao salvar")
      setOriginal(new Set(selected))
      toast.success(
        selected.size > 0
          ? `${selected.size} conta${selected.size === 1 ? "" : "s"} mapeada${selected.size === 1 ? "" : "s"} para ${clientName}`
          : `Mapeamento de contas removido (volta a usar pareamento por nome)`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <p className="text-base font-semibold">Contas do Notion mapeadas</p>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Posts cujo campo <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">Conta</code> no Notion
        estiver entre os valores marcados abaixo serão atribuídos a <strong>{clientName}</strong>. As opções vêm
        de TODAS as conexões Notion da agência — então mesmo que este cliente não tenha o Notion conectado,
        você pode marcar uma conta lida do banco de outro cliente.
      </p>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {sources.length > 0 && (
            <p className="mb-3 text-[13px] text-muted-foreground">
              Lendo de {sources.length} {sources.length === 1 ? "conexão" : "conexões"}:{" "}
              {sources
                .map((s) => `${s.workspaceName ?? "workspace"}${s.dbName ? ` / ${s.dbName}` : ""} (campo "${s.accountField}")`)
                .join(", ")}
            </p>
          )}
          {available.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              Nenhuma opção encontrada nas conexões Notion da agência. Conecte um workspace e selecione
              um banco de dados em Configurações → Notion antes. Você ainda pode digitar valores manualmente
              abaixo.
            </p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {available.map((conta) => (
                <li
                  key={conta}
                  className="flex items-center gap-2 rounded border bg-card px-2 py-1.5 text-base"
                >
                  <input
                    type="checkbox"
                    id={`conta-${clientId}-${conta}`}
                    checked={selected.has(conta)}
                    onChange={() => toggle(conta)}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <label
                    htmlFor={`conta-${clientId}-${conta}`}
                    className="flex-1 cursor-pointer truncate"
                  >
                    {conta}
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Digite o nome exato como aparece no Notion"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addCustom()
                  }
                }}
                className="flex-1 rounded border bg-background px-2 py-1 text-base"
              />
              <Button size="sm" variant="outline" onClick={addCustom} disabled={!customValue.trim()}>
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </Button>
            </div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Salva só o vínculo aqui no VP Social — <strong>não cria nem altera nada no Notion</strong>.
              Se a conta já existe no Notion, é seguro adicionar: o app usa esse valor pra reconhecer
              os posts dela e atribuir a <strong>{clientName}</strong>. Diferenças de maiúsculas/acentos não importam.
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selected.size === 0
                ? "Nenhuma conta selecionada"
                : `${selected.size} selecionada${selected.size === 1 ? "" : "s"}`}
            </p>
            <Button size="sm" onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Salvar
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
