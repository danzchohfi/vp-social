"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import {
  LayoutDashboard,
  Instagram,
  CalendarClock,
  Activity,
  Film,
  UserCheck,
  Settings,
  LayoutGrid,
  History,
  Building2,
  Search,
  ArrowRight,
} from "lucide-react"

// Power-user command palette no estilo Linear/Vercel: ⌘K / Ctrl+K
// abre, Esc fecha, busca fuzzy via cmdk. MVP cobre:
//  - Navegar pra qualquer rota do dashboard
//  - Trocar de cliente (lista lazy-loaded em /api/clients)
// Futuro: ações tipo "Pausar publicações", buscar post por título, etc.

type Client = { id: string; name: string }

const NAV: Array<{
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  keywords: string
}> = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, keywords: "home início painel" },
  { label: "Contas conectadas", href: "/accounts", icon: Instagram, keywords: "instagram facebook youtube tiktok linkedin redes sociais conectar" },
  { label: "Publicações", href: "/scheduled", icon: CalendarClock, keywords: "scheduled posts agendados aprovação" },
  { label: "Atividade", href: "/activity", icon: Activity, keywords: "eventos cross-client timeline" },
  { label: "Produções", href: "/productions", icon: Film, keywords: "roteiros vídeo podcast script" },
  { label: "Aprovadores", href: "/approvers", icon: UserCheck, keywords: "chain magic link cadastro" },
  { label: "Grade do feed", href: "/grid", icon: LayoutGrid, keywords: "instagram grid preview feed" },
  { label: "Histórico", href: "/history", icon: History, keywords: "logs publicações antigas erros" },
  { label: "Configurações", href: "/settings", icon: Settings, keywords: "config notion whatsapp mapeamento" },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const router = useRouter()

  // Atalho global ⌘K / Ctrl+K. Toggle: abre quando fechado, fecha quando aberto.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      if (e.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Lazy-load clients só quando palette abre — evita um GET extra em todo
  // page load do dashboard.
  useEffect(() => {
    if (!open) return
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => setClients(Array.isArray(d.clients) ? d.clients : []))
      .catch(() => { /* silencioso — palette continua usável sem clientes */ })
  }, [open])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  async function switchClient(id: string) {
    setOpen(false)
    try {
      await fetch("/api/clients/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id }),
      })
      window.location.reload()
    } catch {
      // best-effort — recarregar dá feedback de qualquer jeito
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Comandos"
    >
      <Command
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        label="Buscar comandos"
      >
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Command.Input
            autoFocus
            placeholder="Buscar ações, páginas, clientes..."
            className="flex-1 border-0 bg-transparent px-3 py-3.5 text-base outline-none placeholder:text-muted-foreground"
          />
          <span className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">ESC</span>
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
            Nada encontrado.
          </Command.Empty>

          <Command.Group heading="Navegar">
            {NAV.map((item) => {
              const Icon = item.icon
              return (
                <Command.Item
                  key={item.href}
                  value={`${item.label} ${item.keywords}`}
                  onSelect={() => go(item.href)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{item.label}</span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity aria-selected:opacity-100" />
                </Command.Item>
              )
            })}
          </Command.Group>

          {clients.length > 0 && (
            <Command.Group heading="Trocar cliente">
              {clients.map((c) => (
                <Command.Item
                  key={c.id}
                  value={`cliente ${c.name}`}
                  onSelect={() => switchClient(c.id)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{c.name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>

        <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border bg-background px-1 font-mono">↑</kbd>
              <kbd className="rounded border bg-background px-1 font-mono">↓</kbd>
              navegar
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border bg-background px-1 font-mono">↵</kbd>
              selecionar
            </span>
          </div>
          <span className="inline-flex items-center gap-1">
            abrir com
            <kbd className="rounded border bg-background px-1 font-mono">⌘K</kbd>
          </span>
        </div>
      </Command>
    </div>
  )
}
