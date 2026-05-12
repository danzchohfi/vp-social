"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, RefreshCcw, X } from "lucide-react"
import { cn } from "@/lib/utils"

type StaleItem = {
  kind: "instagram" | "notion"
  platform: string
  accountName: string
  accountId: string
  since: string
  reason: "refresh_failed" | "stale"
}

// localStorage key — dismissals are keyed by accountId so a new stale
// account re-surfaces the banner even after the user dismissed earlier
// warnings.
const DISMISS_KEY = "vpsocial_auth_status_dismissed_v1"

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(parsed)
  } catch {
    return new Set()
  }
}

function writeDismissed(set: Set<string>) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(set)))
  } catch {
    // ignore — Safari private mode can throw
  }
}

const RECONNECT_HREF: Record<string, string> = {
  instagram: "/accounts",
  facebook: "/accounts",
  youtube: "/accounts",
  tiktok: "/accounts",
  linkedin: "/accounts",
  notion: "/settings",
}

function reasonCopy(item: StaleItem): string {
  if (item.reason === "refresh_failed") {
    return `token expirou ou foi revogado — reconectar`
  }
  return `sem atividade há ${daysSince(item.since)} dias — reconectar antes que falhe`
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function AuthStatusBanner() {
  const [items, setItems] = useState<StaleItem[] | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed())

  useEffect(() => {
    let cancelled = false
    fetch("/api/auth-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        if (data && Array.isArray(data.stale)) setItems(data.stale)
        else setItems([])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(
    () => (items ?? []).filter((it) => !dismissed.has(it.accountId)),
    [items, dismissed],
  )

  function dismiss(accountId: string) {
    const next = new Set(dismissed)
    next.add(accountId)
    setDismissed(next)
    writeDismissed(next)
  }

  if (!items || visible.length === 0) return null

  return (
    <div className="border-b border-warning/30 bg-warning/10">
      <ul className="mx-auto flex max-w-6xl flex-col divide-y divide-warning/20">
        {visible.map((item) => (
          <li
            key={item.accountId}
            className={cn(
              "flex flex-col gap-2 px-4 py-2 text-sm",
              "sm:flex-row sm:items-center sm:gap-3 sm:px-6",
            )}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning-foreground/80" />
            <div className="min-w-0 flex-1">
              <span className="font-medium capitalize text-warning-foreground">
                {item.platform}
              </span>
              <span className="text-warning-foreground/80"> · {item.accountName} — </span>
              <span className="text-warning-foreground/70">{reasonCopy(item)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <a
                href={RECONNECT_HREF[item.platform] ?? "/accounts"}
                className="inline-flex items-center gap-1 rounded border border-warning/40 bg-background/40 px-2 py-1 text-xs font-medium hover:bg-background/60"
              >
                <RefreshCcw className="h-3 w-3" />
                Reconectar
              </a>
              <button
                type="button"
                onClick={() => dismiss(item.accountId)}
                aria-label="Dispensar aviso"
                className="rounded p-1 text-warning-foreground/60 hover:bg-warning/15 hover:text-warning-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
