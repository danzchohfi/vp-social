"use client"

import { useEffect, useState } from "react"
import { LayoutGrid, AlertTriangle } from "lucide-react"

/**
 * Banner shown at the top of mutating pages (Settings, Accounts, Onboarding)
 * when the user is in agency mode. Mutating actions need a specific active
 * client — we don't try to guess which one. Instead we surface the issue and
 * point to the client switcher.
 */
export function RequiresSingleClient({
  message = "Selecione um cliente específico no menu lateral para configurar este cliente.",
}: {
  message?: string
}) {
  const [agencyMode, setAgencyMode] = useState<boolean | null>(null)

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setAgencyMode(!!data.agencyMode))
      .catch(() => setAgencyMode(false))
  }, [])

  if (!agencyMode) return null

  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
        <LayoutGrid className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Você está em visão agência
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
