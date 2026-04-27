"use client"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Instagram, Plus, Trash2, Loader2, Facebook, Pencil, Check, X } from "lucide-react"

type Account = {
  id: string
  conta: string
  pageName: string
  instagramBusinessAccountId: string
  active: boolean
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  useEffect(() => { fetchAccounts() }, [])

  async function fetchAccounts() {
    const res = await fetch("/api/accounts")
    const data = await res.json()
    setAccounts(data)
    setLoading(false)
  }

  async function handleConnect() {
    setConnecting(true)
    const res = await fetch("/api/facebook/auth-url")
    const { url } = await res.json()
    window.location.href = url
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

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contas Instagram</h1>
          <p className="text-muted-foreground">Conecte as contas dos seus clientes</p>
        </div>
        <Button onClick={handleConnect} disabled={connecting}>
          {connecting ? <Loader2 className="animate-spin" /> : <Facebook className="h-4 w-4 text-blue-600" />}
          Conectar com Facebook
        </Button>
      </div>

      {/* Hint about account name matching */}
      {accounts.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>Importante:</strong> o campo <strong>Conta</strong> (editável abaixo com o lápis) deve ser
          idêntico ao valor da propriedade <strong>Conta</strong> no seu banco de dados Notion.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Instagram className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">Nenhuma conta conectada</h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Clique em "Conectar com Facebook" para autorizar o acesso às contas Instagram Business.
            </p>
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? <Loader2 className="animate-spin" /> : <Plus />}
              Conectar primeira conta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="flex items-center justify-between p-5">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
                    <Instagram className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    {editingId === account.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-7 w-48 text-sm"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(account.id)
                            if (e.key === "Escape") setEditingId(null)
                          }}
                          autoFocus
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={() => saveEdit(account.id)}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{account.conta}</p>
                        <Badge variant={account.active ? "success" : "secondary"}>
                          {account.active ? "Ativa" : "Inativa"}
                        </Badge>
                        <button
                          onClick={() => startEdit(account)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Renomear conta"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground truncate">
                      {account.pageName} · ID: {account.instagramBusinessAccountId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggle(account.id, account.active)}
                  >
                    {account.active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(account.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" className="w-full" onClick={handleConnect} disabled={connecting}>
            <Plus /> Adicionar outra conta
          </Button>
        </div>
      )}
    </div>
  )
}
