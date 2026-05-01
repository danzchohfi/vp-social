"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Building2, Check, Loader2, Plus, Trash2, Pencil, X, ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Client = {
  id: string
  name: string
  logoUrl: string | null
  createdAt: string
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
          <h1 className="text-2xl font-bold">Clientes</h1>
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
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{c.name}</p>
                          {isActive && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              Ativo
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Criado em {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {!isActive && (
                          <Button variant="outline" size="sm" onClick={() => setActive(c.id)}>
                            Tornar ativo
                          </Button>
                        )}
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
