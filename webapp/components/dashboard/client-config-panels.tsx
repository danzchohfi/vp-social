"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Building2, Check, Loader2, Plus, Trash2, Pencil, X, Users, Mail, Copy, Tag, RefreshCw, ListChecks, Pause, Play } from "lucide-react"
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
  // Per-client routing only — the actual WhatsApp credentials (token,
  // phone_id, template) are agency-level now and live in /settings →
  // WhatsApp da agência (one WABA per user, shared across all clients).
  const [whatsappConfigured, setWhatsappConfigured] = useState(false)
  // 'auto' = cron dispatches via Meta Cloud per pending post.
  // 'manual_wame' = cron skips dispatch; agency uses wa.me button on /scheduled.
  const [mode, setMode] = useState<"auto" | "manual_wame">("auto")
  const [origMode, setOrigMode] = useState<"auto" | "manual_wame">("auto")
  const [dispatchMode, setDispatchMode] = useState<"auto" | "manual">("auto")
  const [origDispatchMode, setOrigDispatchMode] = useState<"auto" | "manual">("auto")
  const [waTemplate, setWaTemplate] = useState("")
  const [origWaTemplate, setOrigWaTemplate] = useState("")
  const [briefingFormUrl, setBriefingFormUrl] = useState("")
  const [origBriefingFormUrl, setOrigBriefingFormUrl] = useState("")
  const [briefingNotionPageId, setBriefingNotionPageId] = useState("")
  const [origBriefingNotionPageId, setOrigBriefingNotionPageId] = useState("")
  const [connections, setConnections] = useState<ConnectionStatus[]>([])
  const [status, setStatus] = useState<"configured" | "partial" | "missing" | null>(null)
  const [nextStepHint, setNextStepHint] = useState<string | null>(null)

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
      setWhatsappConfigured(!!data.whatsappConfigured)
      const nextMode = data.approvalNotificationMode === "manual_wame" ? "manual_wame" : "auto"
      setMode(nextMode)
      setOrigMode(nextMode)
      const nextDispatch = data.approvalDispatchMode === "manual" ? "manual" : "auto"
      setDispatchMode(nextDispatch)
      setOrigDispatchMode(nextDispatch)
      const tpl = typeof data.manualWhatsappTemplate === "string" ? data.manualWhatsappTemplate : ""
      setWaTemplate(tpl)
      setOrigWaTemplate(tpl)
      const bf = typeof data.briefingFormUrl === "string" ? data.briefingFormUrl : ""
      setBriefingFormUrl(bf)
      setOrigBriefingFormUrl(bf)
      const bp = typeof data.briefingNotionPageId === "string" ? data.briefingNotionPageId : ""
      setBriefingNotionPageId(bp)
      setOrigBriefingNotionPageId(bp)
      const conns: ConnectionStatus[] = Array.isArray(data.connections) ? data.connections : []
      setConnections(conns)
      setStatus(typeof data.status === "string" ? data.status : null)
      setNextStepHint(typeof data.nextStepHint === "string" ? data.nextStepHint : null)
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
          approvalNotificationMode: mode,
          approvalDispatchMode: dispatchMode,
          manualWhatsappTemplate: waTemplate,
          briefingFormUrl: briefingFormUrl.trim() || null,
          briefingNotionPageId: briefingNotionPageId.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Erro ao salvar")
      }
      toast.success("Configuração salva")
      setOrigMode(mode)
      setOrigDispatchMode(dispatchMode)
      setOrigWaTemplate(waTemplate)
      setOrigBriefingFormUrl(briefingFormUrl)
      setOrigBriefingNotionPageId(briefingNotionPageId)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    mode !== origMode ||
    dispatchMode !== origDispatchMode ||
    waTemplate !== origWaTemplate ||
    briefingFormUrl !== origBriefingFormUrl ||
    briefingNotionPageId !== origBriefingNotionPageId

  return (
    <div className="space-y-4">
      <div>
        <p className="text-base font-semibold">Aprovação do cliente</p>
        <p className="text-sm text-muted-foreground">
          Toda vez que um post entrar no status &quot;aguardando aprovação&quot; (configurado em <a href="/settings" className="underline">/settings</a>), o app gera um link <code className="rounded bg-muted px-1 font-mono text-[12px]">/approve/&lt;token&gt;</code> e avisa o cliente conforme o modo escolhido abaixo. O WhatsApp da agência é compartilhado entre todos os clientes — configurado uma vez em <a href="/settings" className="underline">/settings → WhatsApp da agência</a>.
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

          {/* Briefing form URL — quando setado, /c/[token] mostra botão
              "Solicitar produção" no header. Tipicamente um form do
              Notion que escreve direto na DB de Produções. */}
          <div className="space-y-1.5">
            <Label className="text-sm">URL do form &quot;Solicitar nova produção&quot;</Label>
            <p className="text-sm text-muted-foreground">
              Quando setado, o cliente vê um botão no portal que abre este link em nova aba. Tipicamente um form público do Notion que preenche a DB de Produções. Deixe vazio pra esconder o botão.
            </p>
            <Input
              type="url"
              placeholder="https://notion.so/form/..."
              value={briefingFormUrl}
              onChange={(e) => setBriefingFormUrl(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          {/* Briefing page Notion — link da page que o cliente preencheu
              no form de briefing. Quando setado, /c/[token] mostra aba
              "Briefing" com as propriedades da page renderizadas. */}
          <div className="space-y-1.5">
            <Label className="text-sm">Página do briefing respondido (Notion)</Label>
            <p className="text-sm text-muted-foreground">
              Cole a URL ou o ID da page do Notion com o briefing preenchido por {clientName}. Portal mostra aba &quot;Briefing&quot; com as respostas como referência pro cliente revisar.
            </p>
            <Input
              type="text"
              placeholder="https://notion.so/Briefing-xxx ou 32-hex ID"
              value={briefingNotionPageId}
              onChange={(e) => setBriefingNotionPageId(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          {/* Modo de envio — UMA pergunta só. As 3 opções mapeiam pros 2
              campos do schema (approvalNotificationMode + approvalDispatchMode). */}
          <div className="space-y-1.5">
            <Label className="text-sm">Modo de envio do WhatsApp</Label>
            {(() => {
              type SendMode = "auto" | "manual_batch" | "wa_me"
              const sendMode: SendMode =
                mode === "manual_wame" ? "wa_me"
                  : dispatchMode === "manual" ? "manual_batch"
                    : "auto"
              function pick(next: SendMode) {
                if (next === "auto") {
                  setMode("auto")
                  setDispatchMode("auto")
                } else if (next === "manual_batch") {
                  setMode("auto")
                  setDispatchMode("manual")
                } else {
                  setMode("manual_wame")
                  setDispatchMode("auto")
                }
              }
              const options: Array<{ value: SendMode; label: string; desc: React.ReactNode }> = [
                {
                  value: "auto",
                  label: "Automático por post",
                  desc: <>Cron dispara um WhatsApp pra cada post que entrar em &quot;aguardando&quot;, usando o WhatsApp da agência.</>,
                },
                {
                  value: "manual_batch",
                  label: "Manual em lote",
                  desc: <>Cron prepara os links mas não envia. Você clica <strong>&quot;Notificar pendentes&quot;</strong> no /dashboard pra mandar tudo de uma vez.</>,
                },
                {
                  value: "wa_me",
                  label: "Manual por post (wa.me)",
                  desc: <>Sem API. App gera só o link; você abre o WhatsApp pelo botão <strong>&quot;Enviar via WA&quot;</strong> em /scheduled, um por um.</>,
                },
              ]
              return (
                <div className="grid gap-2 sm:grid-cols-3">
                  {options.map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        "cursor-pointer rounded-lg border p-3 text-sm transition-colors",
                        sendMode === opt.value
                          ? "border-primary bg-primary/5"
                          : "hover:bg-accent",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`approval-send-mode-${clientId}`}
                          value={opt.value}
                          checked={sendMode === opt.value}
                          onChange={() => pick(opt.value)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="font-medium">{opt.label}</span>
                      </div>
                      <p className="mt-1 ml-5 text-muted-foreground">
                        {opt.desc}
                      </p>
                    </label>
                  ))}
                </div>
              )
            })()}
          </div>

          {mode === "manual_wame" && (
            <div className="space-y-1.5">
              <Label className="text-sm">Mensagem padrão do WhatsApp (opcional)</Label>
              <p className="text-sm text-muted-foreground">
                Texto pré-preenchido no botão &quot;Enviar via WA&quot;. Placeholders: <code className="rounded bg-muted px-1 font-mono text-[12px]">{"{{contact_name}}"}</code>, <code className="rounded bg-muted px-1 font-mono text-[12px]">{"{{post_title}}"}</code>, <code className="rounded bg-muted px-1 font-mono text-[12px]">{"{{approval_url}}"}</code>, <code className="rounded bg-muted px-1 font-mono text-[12px]">{"{{client_name}}"}</code>. Em branco = mensagem padrão.
              </p>
              <textarea
                value={waTemplate}
                onChange={(e) => setWaTemplate(e.target.value)}
                placeholder={`Olá {{contact_name}}!\n\nA ${clientName} preparou um post pra você revisar:\n*{{post_title}}*\n\nClique aqui pra aprovar ou pedir alterações:\n{{approval_url}}`}
                rows={6}
                className="w-full rounded border bg-background p-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          {mode === "auto" && !whatsappConfigured && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-medium text-warning">⚠ WhatsApp da agência não configurado</p>
              <p className="mt-1 text-foreground/80">
                O modo automático precisa do token + Phone Number ID + template configurados em <a href="/settings" className="underline">/settings → WhatsApp da agência</a>. Sem isso, cada disparo do cron vai falhar e cair pra envio manual. Pra um cliente específico que não usa Meta Cloud, troque pra &quot;Manual por post&quot; acima.
              </p>
            </div>
          )}

          <Button onClick={save} disabled={saving || !dirty} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar
          </Button>

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
  tacit?: boolean
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
    tacit: ApprovalRow[]
    expired: ApprovalRow[]
    counts: { pending: number; stale: number; decided: number; tacit: number; expired: number }
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
              {data.counts.tacit > 0 && <> · <span className="text-warning">{data.counts.tacit} tácita{data.counts.tacit > 1 ? "s" : ""}</span></>}
              {data.counts.expired > 0 && <> · {data.counts.expired} cancelad{data.counts.expired > 1 ? "os" : "o"}</>}
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
              {data.tacit && data.tacit.length > 0 && (
                <ApprovalHistorySection
                  title="Aprovações tácitas (silêncio em 30 dias)"
                  rows={data.tacit}
                  staleIds={staleIds}
                  tone="decided"
                />
              )}
              {data.expired.length > 0 && (
                <ApprovalHistorySection
                  title="Cancelados (post saiu do status de aprovação)"
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
  const [query, setQuery] = useState("")
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

  function addValue(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    if (!available.includes(trimmed)) {
      setAvailable((prev) => [...prev, trimmed].sort((a, b) => a.localeCompare(b, "pt-BR")))
    }
    setSelected((prev) => new Set([...prev, trimmed]))
    setQuery("")
  }

  function removeValue(value: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(value)
      return next
    })
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

      {!loading && selected.size === 0 && (
        <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          ⚠ <strong>Nenhuma conta mapeada.</strong> Sem isso o cron não roteia posts pra este cliente — posts do
          Notion com qualquer conta vão pra OUTROS clientes (ou serão expirados). Marque pelo menos uma das opções
          abaixo.
        </div>
      )}

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
          {/* Chips das contas já mapeadas — clique no X remove. Substitui
              o checkbox grid (que ficava enorme com muitas contas) por uma
              lista compacta de "o que está aplicado". */}
          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Array.from(selected)
                .sort((a, b) => a.localeCompare(b, "pt-BR"))
                .map((conta) => (
                  <span
                    key={conta}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-sm text-primary"
                  >
                    {conta}
                    <button
                      type="button"
                      onClick={() => removeValue(conta)}
                      className="text-primary/70 hover:text-primary"
                      aria-label={`Remover ${conta}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
            </div>
          )}

          {/* Search + select. Filtra `available` pelo que o usuário digita
              (case + acento-insensitive). Mostra até 8 sugestões. Enter ou
              clique adiciona; se o texto exato não existe na lista mas tem
              algo digitado, oferece "Adicionar '<texto>'". */}
          <div className="rounded-md border bg-card">
            <input
              type="text"
              placeholder="Buscar conta do Notion (ou digitar nova)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) {
                  e.preventDefault()
                  addValue(query)
                }
              }}
              className="w-full rounded-t-md border-b bg-transparent px-3 py-2 text-base focus:outline-none"
            />
            {(() => {
              const norm = (s: string) =>
                s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
              const q = norm(query.trim())
              const candidates = q
                ? available.filter((c) => norm(c).includes(q))
                : available
              const visible = candidates
                .filter((c) => !selected.has(c))
                .slice(0, 8)
              const exactExists = available.some((c) => norm(c) === q)
              return (
                <div className="max-h-64 overflow-auto">
                  {visible.length === 0 && !query.trim() && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      {available.length === 0
                        ? "Nenhuma conta encontrada nas conexões Notion."
                        : "Todas as contas disponíveis já estão mapeadas."}
                    </p>
                  )}
                  {visible.length === 0 && query.trim() && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      Nenhum resultado. Pressione Enter pra adicionar &quot;{query.trim()}&quot;.
                    </p>
                  )}
                  {visible.map((conta) => (
                    <button
                      key={conta}
                      type="button"
                      onClick={() => addValue(conta)}
                      className="block w-full px-3 py-1.5 text-left text-base hover:bg-accent/60"
                    >
                      {conta}
                    </button>
                  ))}
                  {query.trim() && !exactExists && visible.length > 0 && (
                    <button
                      type="button"
                      onClick={() => addValue(query)}
                      className="block w-full border-t px-3 py-1.5 text-left text-sm italic text-muted-foreground hover:bg-accent/60"
                    >
                      Adicionar nova: &quot;{query.trim()}&quot;
                    </button>
                  )}
                </div>
              )
            })()}
          </div>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Salva só o vínculo aqui no VP Social — <strong>não cria nem altera nada no Notion</strong>.
            Se a conta já existe no Notion, é seguro adicionar: o app usa esse valor pra reconhecer
            os posts dela e atribuir a <strong>{clientName}</strong>. Diferenças de maiúsculas/acentos não importam.
          </p>

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

