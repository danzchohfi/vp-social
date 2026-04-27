"use client"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Instagram, Plus, Trash2, Loader2, Facebook } from "lucide-react"

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

  useEffect(() => {
    fetchAccounts()
  }, [])

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
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
                    <Instagram className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{account.conta}</p>
                      <Badge variant={account.active ? "success" : "secondary"}>
                        {account.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {account.pageName} · ID: {account.instagramBusinessAccountId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
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
