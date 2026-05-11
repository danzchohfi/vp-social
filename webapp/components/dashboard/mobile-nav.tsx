"use client"
import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Activity, CalendarClock, Film, Grid3x3, Instagram, LayoutDashboard, LogOut, Settings, UserCheck, X } from "lucide-react"
import { signOut, useSession } from "@/lib/auth-client"
import { ClientSwitcher } from "./client-switcher"

// Bottom tab bar — kept short (4 items) so it stays tappable on small
// screens. Anything more goes into the drawer below.
const tabBar = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/scheduled", label: "Publicações", icon: CalendarClock },
  { href: "/activity", label: "Atividade", icon: Activity },
  { href: "/settings", label: "Config", icon: Settings },
]

// Full nav — surfaced in the drawer so mobile users can reach Grid /
// Produções / Aprovadores / Contas without a desktop sidebar.
const drawerNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Contas", icon: Instagram },
  { href: "/scheduled", label: "Publicações", icon: CalendarClock },
  { href: "/activity", label: "Atividade", icon: Activity },
  { href: "/grid", label: "Preview Grid IG", icon: Grid3x3 },
  { href: "/productions", label: "Produções", icon: Film },
  { href: "/approvers", label: "Aprovadores", icon: UserCheck },
  { href: "/settings", label: "Configurações", icon: Settings },
]

export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const user = session?.user

  async function handleSignOut() {
    await signOut()
    router.push("/login")
  }

  return (
    <>
      {/* Top header — mobile only */}
      <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
        <div className="flex items-center gap-2">
          <img src="/icon.png" alt="VP Social" className="h-7 w-7 rounded-md" />
          <span className="text-base tracking-tight">
            <span className="font-semibold">VP</span>
            <span className="ml-1 italic">Social</span>
          </span>
        </div>
        <button
          onClick={() => setMenuOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full"
          aria-label="Abrir menu"
        >
          {user?.image ? (
            <img src={user.image} alt={user.name ?? ""} className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
              {user?.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
          )}
        </button>
      </header>

      {/* Bottom tab bar — mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabBar.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[12px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="truncate max-w-full">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Slide-out drawer — mobile only */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed bottom-0 right-0 top-0 z-50 flex w-72 flex-col bg-card shadow-xl md:hidden">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="font-semibold">Menu</span>
              <button onClick={() => setMenuOpen(false)} className="rounded-md p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="border-b p-3">
              <ClientSwitcher />
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {drawerNav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/")
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              })}
            </nav>

            <div className="border-t p-3">
              <Link
                href="/account"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
              >
                {user?.image ? (
                  <img src={user.image} alt={user?.name ?? ""} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                    {user?.name?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-base font-medium">{user?.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
                </div>
              </Link>
            </div>

            <div className="border-t p-3">
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="truncate">Sair</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
