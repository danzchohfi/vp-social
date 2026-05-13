import { logger } from "./log"

// Resilient fetch wrapper for external APIs (Meta, IG, FB, YT, TikTok,
// LinkedIn, Notion). Adds:
//   - Configurable retry on 429 + 5xx + network errors with exponential
//     backoff + jitter to avoid thundering herd if many posts queue up.
//   - AbortController timeout (default 30s) so slow APIs don't hang the
//     publish worker.
//   - Structured logs on every retry + final outcome — agency can grep
//     "platform=instagram retry=2" to see exactly which calls flaked.
//
// Drop-in replacement for `fetch()` — same signature, identical return
// shape. Caller still parses .json() / .text() themselves.

export type FetchWithRetryOptions = RequestInit & {
  // Max retry attempts (default 2 — so total of 3 calls including initial).
  // 0 = no retries, behaves like fetch().
  maxRetries?: number
  // Initial backoff in ms. Doubles each attempt (+ ±20% jitter). Default 500.
  backoffMs?: number
  // Per-attempt timeout. Default 30_000ms. The whole call can take up
  // to (timeoutMs * (maxRetries + 1)) in the worst case.
  timeoutMs?: number
  // Structured context to include in logs — typically { platform, userId,
  // clientId, connectionId }. Surfaces in JSON shape so log aggregators
  // can filter "all errors for client X" in one query.
  logContext?: Record<string, unknown>
}

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504])

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function fetchWithRetry(
  url: string | URL,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    maxRetries = 2,
    backoffMs = 500,
    timeoutMs = 30_000,
    logContext = {},
    ...init
  } = options

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), timeoutMs)

    try {
      const res = await fetch(url, { ...init, signal: ac.signal })
      clearTimeout(t)

      // Retry on retryable HTTP status codes.
      if (RETRY_STATUSES.has(res.status) && attempt < maxRetries) {
        // Honor Retry-After when present (seconds), otherwise exponential.
        const retryAfterHeader = res.headers.get("retry-after")
        const retryAfterMs = retryAfterHeader
          ? Number.parseInt(retryAfterHeader, 10) * 1000
          : null
        const delay = retryAfterMs && Number.isFinite(retryAfterMs)
          ? retryAfterMs
          : backoffMs * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4)
        logger.warn({
          ...logContext,
          msg: "fetch_retry",
          url: typeof url === "string" ? url : url.toString(),
          status: res.status,
          attempt: attempt + 1,
          maxRetries,
          delayMs: Math.round(delay),
        })
        await sleep(delay)
        continue
      }

      return res
    } catch (error) {
      clearTimeout(t)
      lastError = error instanceof Error ? error : new Error(String(error))

      // AbortError = our own timeout. Other errors = network failures
      // (DNS, TCP reset, TLS handshake). Both worth retrying.
      const isAbort = lastError.name === "AbortError"
      const isLastAttempt = attempt >= maxRetries
      if (isLastAttempt) {
        logger.error({
          ...logContext,
          msg: "fetch_failed_final",
          url: typeof url === "string" ? url : url.toString(),
          attempt: attempt + 1,
          isAbort,
          error: lastError,
        })
        throw lastError
      }

      const delay = backoffMs * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4)
      logger.warn({
        ...logContext,
        msg: "fetch_retry",
        url: typeof url === "string" ? url : url.toString(),
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(delay),
        isAbort,
        error: lastError.message,
      })
      await sleep(delay)
    }
  }

  // Unreachable — but TypeScript can't prove the loop always throws or
  // returns when maxRetries is reached.
  throw lastError ?? new Error("fetchWithRetry: exhausted retries with no error captured")
}
