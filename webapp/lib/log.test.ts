import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { logger } from "./log"

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("emits JSON to console.log for info level", () => {
    logger.info({ msg: "hello", userId: "u1" })
    expect(logSpy).toHaveBeenCalledTimes(1)
    const line = logSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line)
    expect(parsed.level).toBe("info")
    expect(parsed.msg).toBe("hello")
    expect(parsed.userId).toBe("u1")
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("uses console.warn for warn level", () => {
    logger.warn({ msg: "warn msg" })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it("uses console.error for error level", () => {
    logger.error({ msg: "error msg" })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it("accepts a bare string and wraps it in { msg }", () => {
    logger.info("just a string")
    const line = logSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line)
    expect(parsed.msg).toBe("just a string")
    expect(parsed.level).toBe("info")
  })

  it("serializes Error objects to { message, name, stack }", () => {
    const err = new Error("boom")
    err.name = "CustomError"
    logger.error({ msg: "wrapped", error: err })
    const line = errorSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line)
    expect(parsed.error).toEqual({
      message: "boom",
      name: "CustomError",
      stack: expect.any(String),
    })
  })

  it("preserves arbitrary context fields", () => {
    logger.warn({
      platform: "instagram",
      userId: "u1",
      clientId: "c1",
      connectionId: "n1",
      msg: "fetch failed",
      status: 503,
    })
    const line = warnSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(line)
    expect(parsed.platform).toBe("instagram")
    expect(parsed.userId).toBe("u1")
    expect(parsed.clientId).toBe("c1")
    expect(parsed.connectionId).toBe("n1")
    expect(parsed.status).toBe(503)
  })
})
