// Validators de tokens/credenciais por plataforma. Extraídos de
// /api/settings/test-config (refactor pra compartilhar com /api/health
// dashboard). Cada função recebe credenciais e retorna {ok, message}
// — sem side-effects, sem dependência do Next.js.
//
// Padrão: GET /me (ou equivalent) com o token. Resposta 200 + payload
// esperado = OK. Qualquer outra coisa = erro com mensagem da API.

import { Client as NotionClient } from "@notionhq/client"
import { validateMetaCreds } from "./whatsapp-meta"

export type ValidationResult = { ok: boolean; message: string }

/** Instagram: GET /v21.0/{igAccountId} via Graph API. Retorna @username
 * quando válido. Falha em token expirado, account suspended, escopo
 * insuficiente — tudo mapeia pra ok:false com message da Meta. */
export async function checkInstagram(token: string, igAccountId: string): Promise<ValidationResult> {
  if (!igAccountId) return { ok: false, message: "instagramBusinessAccountId vazio" }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${igAccountId}?fields=username,followers_count&access_token=${token}`)
    const data = await res.json()
    if (!res.ok || data.error) return { ok: false, message: data.error?.message ?? `HTTP ${res.status}` }
    return { ok: true, message: data.username ? `@${data.username}` : "OK" }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Network error" }
  }
}

/** Facebook: GET /v21.0/{pageId} via Graph API. Retorna nome da página. */
export async function checkFacebook(token: string, pageId: string): Promise<ValidationResult> {
  if (!pageId) return { ok: false, message: "pageId vazio" }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=name&access_token=${token}`)
    const data = await res.json()
    if (!res.ok || data.error) return { ok: false, message: data.error?.message ?? `HTTP ${res.status}` }
    return { ok: true, message: data.name ?? "OK" }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Network error" }
  }
}

/** LinkedIn: GET /v2/me com Bearer. Retorna nome do usuário. */
export async function checkLinkedIn(token: string): Promise<ValidationResult> {
  if (!token) return { ok: false, message: "token vazio" }
  try {
    const res = await fetch("https://api.linkedin.com/v2/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 100)}` }
    }
    const data = await res.json()
    return { ok: true, message: data.localizedFirstName ? `${data.localizedFirstName} ${data.localizedLastName ?? ""}`.trim() : "OK" }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Network error" }
  }
}

/** Notion: SDK users.me() com o accessToken da conexão. Retorna o nome
 * do bot ou owner. Falha em token revogado, integração removida do
 * workspace, etc. */
export async function checkNotion(accessToken: string): Promise<ValidationResult> {
  if (!accessToken) return { ok: false, message: "accessToken vazio" }
  try {
    const probe = new NotionClient({ auth: accessToken })
    const me = await probe.users.me({})
    // Notion SDK typing pra users.me não expõe bot.owner.user em todos
    // os casos — extraímos best-effort.
    const name = (me as { bot?: { owner?: { user?: { name?: string } } }; name?: string }).bot?.owner?.user?.name
      ?? (me as { name?: string }).name
      ?? "OK"
    return { ok: true, message: `Conectado como ${name}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Token inválido ou expirado" }
  }
}

/** YouTube/TikTok: refresh do access token. Sucesso = refresh_token
 * ainda válido. Falha = usuário precisa reconectar OAuth. Funções de
 * refresh em lib/youtube|tiktok throwam em erro — capturamos pra
 * ValidationResult uniforme. */
export async function checkYoutube(refreshToken: string): Promise<ValidationResult> {
  if (!refreshToken) return { ok: false, message: "refreshToken vazio" }
  try {
    const { refreshAccessToken } = await import("./youtube")
    await refreshAccessToken(refreshToken)
    return { ok: true, message: "Token vivo (refresh OK)" }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Refresh error" }
  }
}

export async function checkTiktok(refreshToken: string): Promise<ValidationResult> {
  if (!refreshToken) return { ok: false, message: "refreshToken vazio" }
  try {
    const { refreshAccessToken } = await import("./tiktok")
    await refreshAccessToken(refreshToken)
    return { ok: true, message: "Token vivo (refresh OK)" }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Refresh error" }
  }
}

/** WhatsApp Cloud (Meta): wrapper de validateMetaCreds que retorna
 * shape uniforme ValidationResult ao invés do tipo específico. */
export async function checkWhatsapp(token: string, phoneNumberId: string): Promise<ValidationResult> {
  if (!token || !phoneNumberId) return { ok: false, message: "token ou phoneNumberId vazio" }
  const result = await validateMetaCreds(token, phoneNumberId)
  if (result.ok) {
    return { ok: true, message: `${result.displayPhoneNumber} (${result.verifiedName})` }
  }
  return { ok: false, message: result.reason }
}
