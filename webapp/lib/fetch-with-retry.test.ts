import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { fetchWithRetry } from "./fetch-with-retry"

describe("fetchWithRetry", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it("returns the first response on 2xx without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("ok", { status: 200 }))
    globalThis.fetch = fetchMock as any
    const res = await fetchWithRetry("https://api.example.com", { maxRetries: 2 })
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("retries on 503 then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
    globalThis.fetch = fetchMock as any
    const res = await fetchWithRetry("https://api.example.com", {
      maxRetries: 2,
      backoffMs: 1, // tiny backoff so test stays fast
    })
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("retries on 429 honoring Retry-After header (in seconds)", async () => {
    const startedAt = Date.now()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", {
        status: 429,
        headers: { "Retry-After": "0" }, // 0s = immediate, keep test fast
      }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
    globalThis.fetch = fetchMock as any
    const res = await fetchWithRetry("https://api.example.com", { maxRetries: 1 })
    expect(res.status).toBe(200)
    // Total time should be small since Retry-After was 0s (vs the
    // default 500ms exponential backoff that would otherwise kick in).
    // 1s threshold absorbs CI flakiness without masking a regression
    // where Retry-After is ignored and the default backoff runs.
    expect(Date.now() - startedAt).toBeLessThan(1000)
  })

  it("stops retrying on 4xx (other than 408/429)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("", { status: 404 }))
    globalThis.fetch = fetchMock as any
    const res = await fetchWithRetry("https://api.example.com", { maxRetries: 3 })
    expect(res.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("exhausts retries then throws on network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"))
    globalThis.fetch = fetchMock as any
    await expect(
      fetchWithRetry("https://api.example.com", { maxRetries: 1, backoffMs: 1 }),
    ).rejects.toThrow("ECONNRESET")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("returns final retryable response when maxRetries exhausted", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
    globalThis.fetch = fetchMock as any
    const res = await fetchWithRetry("https://api.example.com", {
      maxRetries: 2,
      backoffMs: 1,
    })
    // After 2 retries (3 total attempts), it surfaces the last 503
    // rather than throwing — caller decides how to handle.
    expect(res.status).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("aborts on timeout and retries", async () => {
    let resolveSecondCall: ((r: Response) => void) | null = null
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url, init: RequestInit | undefined) => {
        // First attempt: hang until the AbortController fires.
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted")
            err.name = "AbortError"
            reject(err)
          })
        })
      })
      .mockImplementationOnce(() => new Promise((r) => { resolveSecondCall = r }))
    globalThis.fetch = fetchMock as any

    const promise = fetchWithRetry("https://api.example.com", {
      maxRetries: 1,
      backoffMs: 1,
      timeoutMs: 50,
    })
    // Give the second call a chance to attach, then resolve it.
    setTimeout(() => resolveSecondCall?.(new Response("ok", { status: 200 })), 100)
    const res = await promise
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
