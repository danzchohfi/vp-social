// Lightweight structured-logging helper. Replaces the 30+ bare
// `console.log` / `console.warn` / `console.error` calls scattered
// across lib/*.ts. Same console output (so existing log aggregation
// keeps working) but with consistent JSON shape: every line has
// `{level, ts, msg, ...context}`.
//
// Trigger.dev's own logger gets used inside trigger/*.ts via its
// `logger.info/warn/error` — that path is unaffected. This helper
// is for the Next.js side (route handlers + lib functions) where
// we previously had no structured logging.
//
// Usage:
//   import { logger } from "@/lib/log"
//   logger.warn({ platform: "instagram", userId, msg: "Permalink fetch failed", error: e })
//
// In production, pipe stdout to your aggregation tool of choice
// (Vercel logs → Logtail/Axiom/DataDog/etc.) — every line is
// already a JSON object ready to be ingested.

type LogContext = Record<string, unknown>

function emit(level: "info" | "warn" | "error", arg: LogContext | string): void {
  const ctx: LogContext = typeof arg === "string" ? { msg: arg } : arg
  const line: LogContext = {
    level,
    ts: new Date().toISOString(),
    ...ctx,
  }
  // Serialize error objects → message + stack so they survive JSON.stringify.
  if (line.error instanceof Error) {
    const err = line.error as Error
    line.error = { message: err.message, name: err.name, stack: err.stack }
  }
  const out = JSON.stringify(line)
  if (level === "error") console.error(out)
  else if (level === "warn") console.warn(out)
  else console.log(out)
}

export const logger = {
  info: (arg: LogContext | string) => emit("info", arg),
  warn: (arg: LogContext | string) => emit("warn", arg),
  error: (arg: LogContext | string) => emit("error", arg),
}
