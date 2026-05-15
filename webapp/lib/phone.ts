// E.164-ish phone validation. Catches obviosamente-quebrados (letras,
// muito curto, muito longo) mas é permissivo com formato brasileiro
// sem código do país — Meta auto-detecta country a partir da WABA
// (WABA BR → "11944459535" é interpretado como +5511944459535).
//
// Returns:
//   { valid: true } — looks like a real phone (≥10 digits, max 15)
//   { valid: false, reason } — explain why so the agency UI can fix it
export function validatePhoneE164(raw: string): { valid: true } | { valid: false; reason: string } {
  if (!raw || !raw.trim()) return { valid: false, reason: "telefone vazio" }
  if (raw.match(/[a-z]/i)) return { valid: false, reason: "telefone tem letras" }

  const cleaned = raw.replace(/[^\d+]/g, "")
  const digitsOnly = cleaned.replace(/\D/g, "")

  if (digitsOnly.length < 10) return { valid: false, reason: `só ${digitsOnly.length} dígitos (mínimo 10)` }
  if (digitsOnly.length > 15) return { valid: false, reason: `${digitsOnly.length} dígitos (máximo 15)` }

  // BR sem código do país: 10 dígitos (fixo, ex "1133334444") ou 11
  // (celular, ex "11944459535"), começando com DDD válido (2 dígitos
  // 1-9 + 1-9). Aceita sem exigir +55 — Meta normaliza no contexto da
  // WABA, e wa.me também. Antes barrava com "falta código do país";
  // gerava falsos invalid_phone em /scheduled quando a mensagem
  // chegava normal via Meta.
  return { valid: true }
}

// wa.me click-to-chat URL. Used as a fallback when auto-dispatch is
// disabled or when the agency wants to send manually from /scheduled.
// wa.me wants digits only — no +, no spaces, no dashes.
export function buildWhatsAppClickToChatUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "")
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
