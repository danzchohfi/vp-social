"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Instagram, Settings, CalendarClock, LogOut, Film, UserCheck, Activity, Search } from "lucide-react"
import { signOut, useSession } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { ClientSwitcher } from "@/components/dashboard/client-switcher"

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Contas", icon: Instagram },
  { href: "/scheduled", label: "Publicações", icon: CalendarClock },
  { href: "/activity", label: "Atividade", icon: Activity },
  { href: "/productions", label: "Produções", icon: Film },
  { href: "/approvers", label: "Aprovadores", icon: UserCheck },
  { href: "/settings", label: "Configurações", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()

  async function handleSignOut() {
    await signOut()
    router.push("/login")
  }

  const user = session?.user

  return (
    <aside className="max-md:hidden flex h-full w-60 shrink-0 flex-col overflow-hidden border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <img src="/icon.png" alt="VP Social" className="h-7 w-7 shrink-0 rounded-md" />
        <span className="truncate text-lg tracking-tight">
          <span className="font-semibold">VP</span>
          <span className="ml-1 italic">Social</span>
        </span>
      </div>

      <div className="border-b p-3">
        <ClientSwitcher />
      </div>

      {/* Botão indicando o atalho ⌘K — só ABRE a palette via click;
          o keydown listener no CommandPalette cobre o atalho. Visual
          discreto pra power-users descobrirem. */}
      <button
        type="button"
        onClick={() => {
          // Dispara o mesmo atalho ⌘K manualmente, pra reutilizar a
          // mesma toggle logic do palette.
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
        }}
        className="mx-3 mt-3 flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Buscar...</span>
        <kbd className="rounded border bg-muted/50 px-1 font-mono text-[11px]">⌘K</kbd>
      </button>

      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t p-3 space-y-1">
        {user && (
          <Link
            href="/account"
            className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent"
          >
            {user.image ? (
              <img
                src={user.image}
                alt={user.name}
                className="h-7 w-7 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {user.name?.charAt(0).toUpperCase() ?? "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium">{user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          </Link>
        )}
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-base font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="truncate">Sair</span>
        </button>
      </div>
    </aside>
  )
}
