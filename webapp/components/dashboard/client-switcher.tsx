"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Building2, Check, ChevronsUpDown, Plus, Loader2, Settings as SettingsIcon, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Client = {
  id: string
  name: string
  logoUrl: string | null
}

const ALL_CLIENTS = "__all__"

export function ClientSwitcher() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [activeId, setActiveId] = useState<string>("")
  const [agencyMode, setAgencyMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [showCreate, setShowCreate] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/clients")
      const data = await res.json()
      setClients(data.clients ?? [])
      setActiveId(data.activeClientId ?? "")
      setAgencyMode(!!data.agencyMode)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function selectClient(id: string) {
    // Hitting the same item closes without an unnecessary reload.
    if (!agencyMode && id === activeId) { setOpen(false); return }
    if (agencyMode && id === ALL_CLIENTS) { setOpen(false); return }
    const res = await fetch("/api/clients/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: id }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? "Erro ao trocar cliente")
      return
    }
    setOpen(false)
    router.refresh()
    window.location.reload()
  }

  async function createClient() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar")
      // Set active and route through onboarding so the new client is fully
      // configured (Notion + Contas + Mapeamento) before landing in the
      // dashboard.
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

  const active = clients.find(c => c.id === activeId)
  // Agency mode is only useful with 2+ clients.
  const canAgency = clients.length > 1

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
      >
        {agencyMode ? (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            <LayoutGrid className="h-3.5 w-3.5" />
          </div>
        ) : active?.logoUrl ? (
          <img src={active.logoUrl} alt="" className="h-6 w-6 rounded object-cover" />
        ) : (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            <Building2 className="h-3.5 w-3.5" />
          </div>
        )}
        <span className="flex-1 truncate font-medium">
          {loading ? "Carregando..." : agencyMode ? `Todos os clientes (${clients.length})` : active?.name ?? "Selecione cliente"}
        </span>
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setShowCreate(false) }} />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
            {canAgency && (
              <>
                <button
                  onClick={() => selectClient(ALL_CLIENTS)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                    agencyMode && "bg-accent/50"
                  )}
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                    <LayoutGrid className="h-3 w-3" />
                  </div>
                  <div className="flex-1 truncate">
                    <div className="font-medium">Todos os clientes</div>
                    <div className="text-[10px] text-muted-foreground">visão agência ({clients.length})</div>
                  </div>
                  {agencyMode && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
                <div className="my-1 border-t" />
              </>
            )}
            <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Clientes</p>
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => selectClient(c.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  !agencyMode && c.id === activeId && "bg-accent/50"
                )}
              >
                {c.logoUrl ? (
                  <img src={c.logoUrl} alt="" className="h-5 w-5 rounded object-cover" />
                ) : (
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                    <Building2 className="h-3 w-3" />
                  </div>
                )}
                <span className="flex-1 truncate">{c.name}</span>
                {!agencyMode && c.id === activeId && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}

            <div className="my-1 border-t" />

            {showCreate ? (
              <div className="p-2 space-y-2">
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createClient(); if (e.key === "Escape") setShowCreate(false) }}
                  placeholder="Nome do cliente"
                  className="w-full rounded border px-2 py-1.5 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={createClient}
                    disabled={creating || !newName.trim()}
                    className="flex-1 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {creating ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Criar"}
                  </button>
                  <button
                    onClick={() => { setShowCreate(false); setNewName("") }}
                    className="flex-1 rounded border px-2 py-1 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Novo cliente
                </button>
                <Link
                  href="/clients"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <SettingsIcon className="h-3.5 w-3.5" />
                  Gerenciar clientes
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
