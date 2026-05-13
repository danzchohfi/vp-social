"use client"

import { useEffect, useState } from "react"
import { Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"

const KEY = "vpsocial_density"
type Density = "comfortable" | "compact"

// Toggle entre densidade comfortable (default) ↔ compact. Aplica via
// data-density no <html> e persiste em localStorage. Script inline no
// <head> do layout.tsx aplica a preferência ANTES da hydratação pra
// evitar flash em page load.
export function DensityToggle() {
  const [density, setDensity] = useState<Density>("comfortable")

  useEffect(() => {
    // Lê o estado atual do data-attribute (que o script inline já aplicou).
    // Se nada, default comfortable.
    const current = document.documentElement.dataset.density as Density | undefined
    if (current === "compact" || current === "comfortable") {
      setDensity(current)
    }
  }, [])

  function toggle() {
    const next: Density = density === "compact" ? "comfortable" : "compact"
    setDensity(next)
    document.documentElement.dataset.density = next
    try { localStorage.setItem(KEY, next) } catch { /* private mode */ }
  }

  const Icon = density === "compact" ? Maximize2 : Minimize2
  const label = density === "compact" ? "Aumentar densidade" : "Diminuir densidade"

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
