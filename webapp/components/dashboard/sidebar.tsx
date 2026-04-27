"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Instagram, Settings, Zap, BookOpen, LogOut } from "lucide-react"
import { signOut } from "@/lib/auth-client"
import { useRouter } from "next/navigation"

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Contas", icon: Instagram },
  { href: "/settings", label: "Configurações", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.push("/login")
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold">Publify</span>
      </div>

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

      <div className="border-t p-3">
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
