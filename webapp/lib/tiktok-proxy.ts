import crypto from "crypto"

// HMAC SHA-256 completo (64 hex chars / 256 bits). Antes era truncado
// pra 32 chars (128 bits) — INFO-4 do audit. Mantemos retrocompat
// aceitando 32-char OU 64-char no verify pra não invalidar URLs em uso.
function hmac(value: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? ""
  return crypto.createHmac("sha256", secret).update(value).digest("hex")
}

export function signProxyUrl(videoUrl: string): string {
  const sig = hmac(videoUrl)
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ""
  return `${base}/api/tiktok-proxy?url=${encodeURIComponent(videoUrl)}&sig=${sig}`
}

export function verifyProxySig(videoUrl: string, sig: string): boolean {
  const expected = hmac(videoUrl)
  // Aceita full (64) e legacy truncated (32) durante transição.
  const candidate = sig.length === 32 ? expected.slice(0, 32) : expected
  if (sig.length !== candidate.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(candidate))
  } catch {
    return false
  }
}
