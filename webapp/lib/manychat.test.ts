import { describe, expect, it } from "vitest"
import { validatePhoneE164, buildWhatsAppClickToChatUrl } from "./manychat"

describe("validatePhoneE164", () => {
  it("accepts proper E.164 numbers", () => {
    expect(validatePhoneE164("+5511999999999")).toEqual({ valid: true })
    expect(validatePhoneE164("+12025550173")).toEqual({ valid: true })
    expect(validatePhoneE164("+34699999999")).toEqual({ valid: true })
  })

  it("strips formatting (spaces, dashes, parens) before validating", () => {
    expect(validatePhoneE164("+55 (11) 9 9999-9999")).toEqual({ valid: true })
    expect(validatePhoneE164("+1-202-555-0173")).toEqual({ valid: true })
  })

  it("rejects empty / whitespace-only input", () => {
    expect(validatePhoneE164("")).toEqual({ valid: false, reason: "telefone vazio" })
    expect(validatePhoneE164("   ")).toEqual({ valid: false, reason: "telefone vazio" })
  })

  it("rejects numbers with letters", () => {
    const result = validatePhoneE164("+55 abc 11999999999")
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe("telefone tem letras")
  })

  it("rejects too-short numbers", () => {
    const result = validatePhoneE164("+551199")
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toMatch(/mínimo 10/)
  })

  it("rejects too-long numbers", () => {
    const result = validatePhoneE164("+55119999999999999999")
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toMatch(/máximo 15/)
  })

  it("flags missing country code on 11-digit BR mobile", () => {
    const result = validatePhoneE164("11999999999")
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toMatch(/código do país/)
  })

  it("accepts properly-prefixed BR mobile (+55 + 11 digits)", () => {
    expect(validatePhoneE164("+55 11 99999-9999")).toEqual({ valid: true })
  })
})

describe("buildWhatsAppClickToChatUrl", () => {
  it("builds a wa.me URL from a valid phone + message", () => {
    const url = buildWhatsAppClickToChatUrl("+5511999999999", "Olá!")
    expect(url).not.toBeNull()
    expect(url).toMatch(/^https:\/\/wa\.me\/5511999999999\?text=/)
    expect(url).toMatch(/Ol%C3%A1!?/)
  })

  it("strips formatting from the phone before building", () => {
    const url = buildWhatsAppClickToChatUrl("+55 (11) 99999-9999", "test")
    expect(url).toMatch(/^https:\/\/wa\.me\/5511999999999/)
  })

  it("returns null for invalid/empty phone", () => {
    expect(buildWhatsAppClickToChatUrl("", "msg")).toBeNull()
    expect(buildWhatsAppClickToChatUrl("abc", "msg")).toBeNull()
  })

  it("URL-encodes the message", () => {
    const url = buildWhatsAppClickToChatUrl("+5511999999999", "olá & test")
    expect(url).toMatch(/text=ol%C3%A1%20%26%20test/)
  })
})
