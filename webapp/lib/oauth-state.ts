// OAuth state CSRF protection shared by todos os 5 fluxos OAuth
// (Notion / Facebook / YouTube / TikTok / LinkedIn).
//
// Antes: state era literal `${userId}:${from}` na URL. Atacante que
// soubesse o userId da vítima podia iniciar fluxo OAuth com state
// fake, levar a vítima ao callback, e linkar a conta do atacante sob
// o tenant da vítima. Não havia nonce, não havia validação cross-side.
//
// Agora:
//   1. createOAuthState(userId, from) gera nonce 256-bit, grava
//      {nonce, userId, from} num cookie HTTPONLY signed-ish (httpOnly
//      + secure + sameSite=lax + 10min TTL). State retornado pra URL
//      é APENAS o nonce — userId nunca aparece em URL/log de OAuth
//      provider.
//   2. consumeOAuthState(state) lê o cookie, compara nonce em modo
//      timing-safe, retorna {userId, from} se OK senão null. Cookie é
//      apagado em qualquer caso (single-use, previne replay).
//
// `from` é restrito a allowlist — paths internos válidos. Evita open
// redirect via `${appUrl}/${from}` no callback.

import { cookies } from "next/headers"
import { randomBytes, timingSafeEqual } from "crypto"

const COOKIE_NAME = "vpsocial_oauth_state"
// 10min é tempo de sobra pra usuário completar fluxo OAuth típico.
// Mais que isso vira janela útil pra replay attack.
const COOKIE_MAX_AGE = 10 * 60

// Paths internos pra onde callbacks podem redirecionar. Acrescente aqui
// se precisar redirecionar pra novo path. Tudo fora dessa lista cai
// no default do callback (geralmente /settings).
const ALLOWED_FROM = new Set([
  "onboarding",
  "settings",
  "accounts",
  "clients",
])

export function safeFrom(from: string | null | undefined): string {
  if (!from) return ""
  return ALLOWED_FROM.has(from) ? from : ""
}

export async function createOAuthState(userId: string, from: string): Promise<string> {
  const nonce = randomBytes(32).toString("base64url")
  const safe = safeFrom(from)
  const payload = JSON.stringify({ nonce, userId, from: safe })
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, payload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  })
  return nonce
}

export async function consumeOAuthState(state: string): Promise<{ userId: string; from: string } | null> {
  if (!state) return null
  const cookieStore = await cookies()
  const raw = cookieStore.get(COOKIE_NAME)?.value
  // Single-use: deletamos antes mesmo de validar pra prevenir replay
  // numa request paralela com o mesmo state.
  cookieStore.delete(COOKIE_NAME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { nonce?: unknown; userId?: unknown; from?: unknown }
    if (typeof parsed.nonce !== "string" || typeof parsed.userId !== "string") return null
    const got = Buffer.from(state)
    const want = Buffer.from(parsed.nonce)
    if (got.length !== want.length) return null
    if (!timingSafeEqual(got, want)) return null
    return {
      userId: parsed.userId,
      from: typeof parsed.from === "string" ? safeFrom(parsed.from) : "",
    }
  } catch {
    return null
  }
}
