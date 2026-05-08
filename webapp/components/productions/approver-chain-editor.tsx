"use client"
/**
 * Inline chain editor for the production detail sidebar.
 *
 * Shows the ordered list of approvers, with up/down reorder buttons +
 * remove. Add via combobox of existing approvers OR "criar novo" inline
 * which calls POST /api/approvers and selects the result.
 *
 * State stays local (no server sync until Save). Parent controls when to
 * send the new list (calls onSave with approverIds in chain order). This
 * keeps the UX snappy and avoids one-by-one round trips.
 */

import { useEffect, useState } from "react"
import { Plus, Trash2, ArrowUp, ArrowDown, Loader2, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export type ApproverOption = {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  // Permanent portal token. Empty string when the underlying approver
  // was deleted (chain row points at a missing FK — fallback in API).
  magicToken: string
}

export type ApproverChainEditorProps = {
  /** Initial chain — ordered by stepOrder ascending. */
  initial: ApproverOption[]
  /** All approvers available to attach. */
  available: ApproverOption[]
  /** Persists the new chain. Returns true on success. */
  onSave: (approverIds: string[]) => Promise<boolean>
  /** Disabled when production is past chain-edit (e.g., awaiting approval). */
  disabled?: boolean
  /** Refresh `available` after creating a new approver. */
  onApproverCreated?: () => Promise<void> | void
}

export function ApproverChainEditor({
  initial,
  available,
  onSave,
  disabled,
  onApproverCreated,
}: ApproverChainEditorProps) {
  const [chain, setChain] = useState<ApproverOption[]>(initial)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [newEmail, setNewEmail] = useState("")

  useEffect(() => setChain(initial), [initial])

  const dirty = chain.length !== initial.length || chain.some((a, i) => a.id !== initial[i]?.id)
  const candidates = available.filter((a) => !chain.some((c) => c.id === a.id))

  async function copyPortalLink(approver: ApproverOption) {
    if (!approver.magicToken) {
      toast.error("Aprovador sem token (foi removido)")
      return
    }
    const url = `${window.location.origin}/a/${approver.magicToken}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(`Link de ${approver.name} copiado`)
    } catch {
      // Clipboard write can fail on iOS Safari without a user-gesture
      // chain — fall back to a prompt the user can copy from manually.
      window.prompt("Copie o link:", url)
    }
  }

  function move(idx: number, delta: number) {
    const next = [...chain]
    const tgt = idx + delta
    if (tgt < 0 || tgt >= next.length) return
    ;[next[idx], next[tgt]] = [next[tgt], next[idx]]
    setChain(next)
  }
  function remove(idx: number) {
    setChain(chain.filter((_, i) => i !== idx))
  }
  function addExisting(approver: ApproverOption) {
    setChain([...chain, approver])
    setShowAdd(false)
  }

  async function createInline() {
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
          phone: newPhone.trim() || undefined,
          email: newEmail.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar approver")
      const created: ApproverOption = data.approver
      setChain([...chain, created])
      setNewName("")
      setNewPhone("")
      setNewEmail("")
      setShowAdd(false)
      await onApproverCreated?.()
      toast.success(`Approver "${created.name}" criado e adicionado à chain`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  async function save() {
    setSaving(true)
    const ok = await onSave(chain.map((a) => a.id))
    setSaving(false)
    if (ok) toast.success("Chain salva")
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Aprovadores ({chain.length})
        </h3>
        {dirty && !disabled && (
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Salvar
          </Button>
        )}
      </div>

      {chain.length === 0 ? (
        <p className="rounded border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Nenhum aprovador. {disabled ? "" : "Adicione abaixo."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {chain.map((a, idx) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {a.phone ?? a.email ?? "sem contato"} · {a.role}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                {a.magicToken && (
                  <button
                    type="button"
                    onClick={() => copyPortalLink(a)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent"
                    title="Copiar link do portal"
                  >
                    <Link2 className="h-3 w-3" />
                  </button>
                )}
                {!disabled && (
                  <>
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                      title="Subir"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={idx === chain.length - 1}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                      title="Descer"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                      title="Remover"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <>
          {!showAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar aprovador
            </button>
          ) : (
            <div className="space-y-2 rounded-md border bg-muted/20 p-2">
              {candidates.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Existentes
                  </p>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {candidates.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => addExisting(a)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        <Plus className="h-3 w-3 text-muted-foreground" />
                        <span className="flex-1 truncate">{a.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {a.phone ?? a.email ?? ""}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5 border-t pt-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Criar novo
                </p>
                <input
                  type="text"
                  placeholder="Nome"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded border bg-background px-2 py-1 text-sm"
                />
                <input
                  type="tel"
                  placeholder="Telefone (E.164, ex: +5511...)"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full rounded border bg-background px-2 py-1 text-sm"
                />
                <input
                  type="email"
                  placeholder="Email (opcional)"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded border bg-background px-2 py-1 text-sm"
                />
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={createInline} disabled={creating}>
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Criar e adicionar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
