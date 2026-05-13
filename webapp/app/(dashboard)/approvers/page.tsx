"use client"
/**
 * Approvers admin page (Wave 2D, May 2026).
 *
 * Lists every approver in the agency scope with their magic-link URL so
 * the owner can copy/share once. Owners can create new approvers
 * (auto-generates a magic token), edit name/email/phone/role, regenerate
 * the magic token (revokes the old URL), and see how many productions
 * each approver is currently attached to.
 *
 * The chain editor on the production sidebar (Wave 2A) already had
 * inline-create + copy-link, so this page is mostly a cross-production
 * roster + revoke surface — the agency's "address book" of approvers.
 */

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { PostRowSkeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import {
  Loader2,
  Plus,
  Copy,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  Check,
  UserCheck,
  MessageCircle,
  Link2,
} from "lucide-react"
import { toast } from "sonner"

type Approver = {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  magicToken: string
  magicTokenIssuedAt: string
  notes: string | null
  usageCount: number          // productions in chain
  postPendingCount?: number   // posts currently awaiting this approver (PR AQ)
  createdAt: string
}

const ROLE_LABEL: Record<string, string> = {
  client: "Cliente",
  internal_reviewer: "Revisor interno",
  final_approver: "Aprovador final",
}

export default function ApproversPage() {
  const [approvers, setApprovers] = useState<Approver[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [newRole, setNewRole] = useState("client")
  const [editingId, setEditingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/approvers")
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao carregar aprovadores")
        return
      }
      setApprovers(data.approvers ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function createApprover() {
    if (!newName.trim()) {
      toast.error("Nome obrigatório")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/approvers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim() || undefined,
          phone: newPhone.trim() || undefined,
          role: newRole,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar")
      toast.success(`Aprovador "${data.approver.name}" criado`)
      setNewName("")
      setNewEmail("")
      setNewPhone("")
      setNewRole("client")
      setShowNew(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  async function copyMagicLink(approver: Approver) {
    const url = `${window.location.origin}/a/${approver.magicToken}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(`Link de ${approver.name} copiado`)
    } catch {
      window.prompt("Copie o link:", url)
    }
  }

  function shareViaWhatsApp(approver: Approver) {
    if (!approver.phone) {
      toast.error("Cadastre um telefone primeiro")
      return
    }
    const url = `${window.location.origin}/a/${approver.magicToken}`
    const text = `Olá ${approver.name}! Aqui está seu portal pessoal pra aprovar conteúdo: ${url}`
    const phone = approver.phone.replace(/\D/g, "")
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank")
  }

  async function regenerateToken(approver: Approver) {
    if (!confirm(
      `Regerar o token de ${approver.name}?\n\nO link antigo (/a/${approver.magicToken.slice(0, 8)}…) vai parar de funcionar imediatamente. Você precisará enviar o novo link.`,
    )) return
    try {
      const res = await fetch(`/api/approvers/${approver.id}/regenerate-token`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao regerar token")
      toast.success("Novo token gerado — copie e envie ao aprovador")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  async function deleteApprover(approver: Approver) {
    const parts: string[] = []
    if (approver.usageCount > 0) {
      parts.push(`${approver.usageCount} produção${approver.usageCount === 1 ? "" : "ões"}`)
    }
    if ((approver.postPendingCount ?? 0) > 0) {
      parts.push(`${approver.postPendingCount} post${approver.postPendingCount === 1 ? "" : "s"} pendente${approver.postPendingCount === 1 ? "" : "s"}`)
    }
    if (parts.length > 0) {
      if (!confirm(
        `${approver.name} está em ${parts.join(" e ")}. Excluir vai desvincular dessas chains/posts (o post-link ainda funciona pelo /approve/<token>). Continuar?`,
      )) return
    } else {
      if (!confirm(`Excluir ${approver.name}?`)) return
    }
    try {
      const res = await fetch(`/api/approvers/${approver.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? "Erro ao excluir")
      toast.success("Aprovador excluído")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <PageHeader
        title="Aprovadores"
        subtitle={
          <>
            Pessoas que aprovam <strong>posts</strong> e <strong>roteiros de produções</strong>. Cada uma tem um portal pessoal{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">/a/&#123;token&#125;</code> com tudo
            que está aguardando decisão — produções entram pela chain editada na produção; posts entram automaticamente quando o telefone bate com o contato resolvido do Notion.
          </>
        }
        action={
          <Button onClick={() => setShowNew(true)} disabled={showNew}>
            <Plus className="h-4 w-4" />
            Novo aprovador
          </Button>
        }
      />

      {showNew && (
        <Card className="mb-4">
          <CardContent className="space-y-3 pt-6">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createApprover()
                }}
                placeholder="Nome completo"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Telefone (E.164, ex: +5511999999999)</Label>
                <Input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+5511..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email (opcional)</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Papel</Label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="h-9 w-full rounded border bg-background px-2 text-base"
              >
                <option value="client">Cliente</option>
                <option value="internal_reviewer">Revisor interno</option>
                <option value="final_approver">Aprovador final</option>
              </select>
              <p className="text-[13px] text-muted-foreground">
                Apenas informativo — não afeta a ordem da chain. Ordem é definida na produção.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={createApprover} disabled={creating || !newName.trim()}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Criar
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowNew(false)
                  setNewName("")
                  setNewEmail("")
                  setNewPhone("")
                  setNewRole("client")
                }}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <PostRowSkeleton count={3} />
      ) : approvers.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          tone="primary"
          title="Nenhum aprovador cadastrado"
          description="Crie aprovadores aqui ou direto na chain de uma produção."
        />
      ) : (
        <div className="space-y-2">
          {approvers.map((a) => (
            <ApproverRow
              key={a.id}
              approver={a}
              isEditing={editingId === a.id}
              onStartEdit={() => setEditingId(a.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaved={async () => {
                setEditingId(null)
                await load()
              }}
              onCopyLink={() => copyMagicLink(a)}
              onShareWhatsApp={() => shareViaWhatsApp(a)}
              onRegenerateToken={() => regenerateToken(a)}
              onDelete={() => deleteApprover(a)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ApproverRow({
  approver,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaved,
  onCopyLink,
  onShareWhatsApp,
  onRegenerateToken,
  onDelete,
}: {
  approver: Approver
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaved: () => Promise<void>
  onCopyLink: () => void
  onShareWhatsApp: () => void
  onRegenerateToken: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(approver.name)
  const [email, setEmail] = useState(approver.email ?? "")
  const [phone, setPhone] = useState(approver.phone ?? "")
  const [role, setRole] = useState(approver.role)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isEditing) {
      setName(approver.name)
      setEmail(approver.email ?? "")
      setPhone(approver.phone ?? "")
      setRole(approver.role)
    }
  }, [isEditing, approver])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/approvers/${approver.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          role,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? "Erro ao salvar")
      toast.success("Aprovador atualizado")
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (isEditing) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="space-y-1.5">
            <Label className="text-sm">Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Telefone</Label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Papel</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-9 w-full rounded border bg-background px-2 text-base"
            >
              <option value="client">Cliente</option>
              <option value="internal_reviewer">Revisor interno</option>
              <option value="final_approver">Aprovador final</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Salvar
            </Button>
            <Button size="sm" variant="outline" onClick={onCancelEdit}>
              <X className="h-3.5 w-3.5" />
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 break-words font-semibold">{approver.name}</p>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[12px] uppercase tracking-wider text-muted-foreground">
                {ROLE_LABEL[approver.role] ?? approver.role}
              </span>
              {approver.usageCount > 0 && (
                <span
                  className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary"
                  title="Produções nas quais este aprovador faz parte da chain"
                >
                  {approver.usageCount} produção{approver.usageCount === 1 ? "" : "ões"}
                </span>
              )}
              {(approver.postPendingCount ?? 0) > 0 && (
                <span
                  className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[12px] font-medium text-warning"
                  title="Posts atualmente aguardando aprovação deste contato"
                >
                  {approver.postPendingCount} post{approver.postPendingCount === 1 ? "" : "s"} pendente{approver.postPendingCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {approver.phone ?? "—"}
              {approver.email && (
                <>
                  <span className="mx-1.5">·</span>
                  <span>{approver.email}</span>
                </>
              )}
            </p>
            <div className="mt-2 flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5 text-[13px]">
              <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
              <code className="min-w-0 flex-1 truncate font-mono">
                /a/{approver.magicToken.slice(0, 12)}…{approver.magicToken.slice(-4)}
              </code>
              <button
                type="button"
                onClick={onCopyLink}
                className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Copiar link"
              >
                <Copy className="h-3 w-3" />
                Copiar
              </button>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1">
            {approver.phone && (
              <Button variant="outline" size="sm" onClick={onShareWhatsApp} title="Enviar pelo WhatsApp">
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onRegenerateToken}
              title="Regerar token (revoga o link antigo)"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onStartEdit} title="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
              title="Excluir"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
