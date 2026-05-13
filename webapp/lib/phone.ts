// E.164-ish phone validation. Used before dispatching WhatsApp via Meta
// Cloud (and before showing per-link "Enviar via WA" buttons) — catches
// the most common mistakes the agency types in Notion (too short/long,
// letters mixed in, missing country code).
//
// Returns:
//   { valid: true } — looks like a real phone (≥10 digits, max 15)
//   { valid: false, reason } — explain why so the agency UI can fix it
export function validatePhoneE164(raw: string): { valid: true } | { valid: false; reason: string } {
  if (!raw || !raw.trim()) return { valid: false, reason: "telefone vazio" }
  const cleaned = raw.replace(/[^\d+]/g, "")
  const digitsOnly = cleaned.replace(/\D/g, "")
  if (raw.match(/[a-z]/i)) return { valid: false, reason: "telefone tem letras" }
  // E.164: 1–3 digit country code + subscriber number = 7–15 digits total.
  // Brazil real-world: +55 + 11 digits = 13 total; we accept 10+ to allow
  // tests against truncated numbers.
  if (digitsOnly.length < 10) return { valid: false, reason: `só ${digitsOnly.length} dígitos (mínimo 10)` }
  if (digitsOnly.length > 15) return { valid: false, reason: `${digitsOnly.length} dígitos (máximo 15)` }
  const noPlus = cleaned.replace(/^\+/, "")
  if (!cleaned.startsWith("+") && noPlus.length === 11 && /^[1-9]/.test(noPlus)) {
    return { valid: false, reason: "falta o código do país (ex: +55 para Brasil)" }
  }
  return { valid: true }
}

// wa.me click-to-chat URL. Used as a fallback when auto-dispatch is
// disabled or when the agency wants to send manually from /scheduled.
// wa.me wants digits only — no +, no spaces, no dashes.
export function buildWhatsAppClickToChatUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "")
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
