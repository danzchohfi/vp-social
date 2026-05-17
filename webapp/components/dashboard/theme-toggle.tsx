"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

const KEY = "producao_theme"
type Theme = "dark" | "light"

// Toggle entre dark (default em rotas internas) ↔ light. Aplica via
// .dark class no <html> e persiste em localStorage. Script inline no
// <head> do app/layout.tsx aplica a preferência ANTES da hydratação
// pra evitar flash em page load.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark")

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light")
  }, [])

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark"
    setTheme(next)
    document.documentElement.classList.toggle("dark", next === "dark")
    try { localStorage.setItem(KEY, next) } catch { /* private mode */ }
  }

  const Icon = theme === "dark" ? Sun : Moon
  const label = theme === "dark" ? "Mudar pra modo claro" : "Mudar pra modo escuro"

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}
