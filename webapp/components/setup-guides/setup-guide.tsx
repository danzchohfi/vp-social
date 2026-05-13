"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// Reusable step-by-step setup guide. Renders an accordion: N numbered
// steps with body copy, optional external link, optional copy button,
// optional common-errors disclosure. Mark-done checkbox per step
// persists in localStorage so progress survives reloads.
//
// Extracted from the inline MetaCloudSetupGuide in client-config-panels.tsx
// so we can reuse the same UX for Notion + Instagram + future platforms.
// First-mount opens the first not-done step. Auto-collapses to a compact
// "✓ Setup completo" pill when all steps are done AND the credentials
// signal (passed in via `complete`) is true.

export type SetupStep = {
  title: string
  body: React.ReactNode
  href?: string
  hrefLabel?: string
  commonErrors?: Array<{ q: string; a: string }>
  copy?: { label: string; text: string }
}

export function SetupGuide({
  title,
  subtitle,
  storageKey,
  steps,
  complete,
}: {
  title: string
  subtitle: string
  // localStorage namespace, scoped per client + provider to avoid
  // collisions. Format: `vpsocial_<provider>_setup_<clientId>`.
  storageKey: string
  steps: SetupStep[]
  // External signal that credentials are saved (drives auto-collapse).
  complete: boolean
}) {
  const [stepsDone, setStepsDone] = useState<Set<number>>(() => new Set())
  const [openStep, setOpenStep] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as { stepsDone?: number[] }
        if (Array.isArray(parsed?.stepsDone)) {
          setStepsDone(new Set(parsed.stepsDone))
        }
      }
    } catch {
      // ignore corrupt state
    }
  }, [storageKey])

  useEffect(() => {
    const firstUndone = steps.findIndex((_, i) => !stepsDone.has(i))
    if (openStep === null) setOpenStep(firstUndone === -1 ? null : firstUndone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleDone(idx: number) {
    setStepsDone((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ stepsDone: Array.from(next), lastUpdated: new Date().toISOString() }),
        )
      } catch {
        // localStorage can fail in private mode; degrade gracefully
      }
      return next
    })
  }

  async function copyText(idx: number, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 2000)
    } catch {
      toast.error("Falha ao copiar — copia manualmente")
    }
  }

  const doneCount = stepsDone.size
  const total = steps.length
  const allDone = doneCount === total
  const setupComplete = allDone && complete

  if (collapsed || setupComplete) {
    return (
      <div className="rounded-md border border-success/30 bg-success/5 p-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-success">
            {setupComplete ? `✓ Setup ${title} completo` : `${doneCount}/${total} passos do setup feitos`}
          </span>
          <button
            onClick={() => setCollapsed(false)}
            className="text-[12px] text-muted-foreground hover:underline"
          >
            Ver guia
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <p className="text-base font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{doneCount}/{total} passos · {subtitle}</p>
        </div>
        {doneCount > 0 && (
          <button
            onClick={() => setCollapsed(true)}
            className="text-[12px] text-muted-foreground hover:underline"
          >
            Ocultar
          </button>
        )}
      </div>
      <ol className="divide-y">
        {steps.map((step, idx) => {
          const isDone = stepsDone.has(idx)
          const isOpen = openStep === idx
          return (
            <li key={idx} className={cn("transition-colors", isDone && "bg-success/[0.03]")}>
              <button
                onClick={() => setOpenStep(isOpen ? null : idx)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/30"
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                    isDone ? "bg-success text-white" : "bg-muted text-muted-foreground",
                  )}
                >
                  {isDone ? "✓" : idx + 1}
                </span>
                <span className={cn("flex-1 text-sm font-medium", isDone && "text-muted-foreground line-through")}>
                  {step.title}
                </span>
                <span className="text-muted-foreground">{isOpen ? "▴" : "▾"}</span>
              </button>
              {isOpen && (
                <div className="space-y-2 px-3 pb-3 pl-12 text-sm">
                  <div className="leading-relaxed text-foreground/90">{step.body}</div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {step.href && (
                      <a
                        href={step.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[12px] font-medium text-primary hover:bg-primary/20"
                      >
                        {step.hrefLabel ?? "Abrir"} →
                      </a>
                    )}
                    {step.copy && (
                      <button
                        onClick={() => copyText(idx, step.copy!.text)}
                        className="inline-flex items-center gap-1 rounded-md border border-muted bg-muted/30 px-2 py-1 text-[12px] font-medium hover:bg-muted"
                      >
                        {copiedIdx === idx ? "✓ Copiado" : step.copy.label}
                      </button>
                    )}
                    <label className="ml-auto inline-flex items-center gap-1.5 cursor-pointer text-[12px] text-muted-foreground hover:text-foreground">
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => toggleDone(idx)}
                        className="h-3.5 w-3.5"
                      />
                      Marquei como feito
                    </label>
                  </div>

                  {step.copy && (
                    <pre className="mt-1 max-h-32 overflow-auto rounded-md border bg-muted/30 p-2 text-[12px] font-mono whitespace-pre-wrap">
                      {step.copy.text}
                    </pre>
                  )}

                  {step.commonErrors && step.commonErrors.length > 0 && (
                    <details className="mt-2 text-[12px]">
                      <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                        ⚠ Erros comuns ({step.commonErrors.length})
                      </summary>
                      <ul className="mt-1 space-y-1.5 pl-2">
                        {step.commonErrors.map((err, i) => (
                          <li key={i} className="rounded bg-muted/30 px-2 py-1">
                            <strong>{err.q}</strong>: {err.a}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
