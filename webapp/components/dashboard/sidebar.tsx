"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Instagram, Settings, Zap, History, CalendarClock, LogOut, Building2 } from "lucide-react"
import { signOut, useSession } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { ClientSwitcher } from "@/components/dashboard/client-switcher"

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clientes", icon: Building2 },
  { href: "/accounts", label: "Contas", icon: Instagram },
  { href: "/scheduled", label: "Agendados", icon: CalendarClock },
  { href: "/history", label: "Histórico", icon: History },
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
    <aside className="flex h-full w-60 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold">Publify</span>
      </div>

      {/* Client switcher */}
      <div className="border-b p-3">
        <ClientSwitcher />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User + Sign out */}
      <div className="border-t p-3 space-y-1">
        {user && (
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            {user.image ? (
              <img
                src={user.image}
                alt={user.name}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {user.name?.charAt(0).toUpperCase() ?? "?"}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  )
}
