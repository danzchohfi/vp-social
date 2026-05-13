// Meta WhatsApp Cloud API client — direct dispatch, no ManyChat in
// the middle. Sends a pre-approved template message to any phone
// number that has WhatsApp (no subscriber lookup, no opt-in problem
// at the API level — Meta handles deliverability rules via the
// template approval process upstream).
//
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/
//
// Flow at agency setup (one-time):
//   1. Meta App > WhatsApp > API Setup → grab Phone Number ID.
//   2. Meta Business Settings > Users > System Users → create
//      System User + assign WA permissions + generate PERMANENT
//      token (NOT the 24h "temporary access token" from API Setup).
//   3. Meta Business Manager > WhatsApp Manager > Message Templates →
//      create template (Category: Utility, body with {{1}} {{2}} {{3}}
//      placeholders, submit for review). Wait 24-48h.
//   4. /settings → Aprovação cliente → switch provider to Meta Cloud
//      and paste token + phone_number_id + template_name.
//
// Per dispatch:
//   POST /v18.0/{phoneNumberId}/messages with template name +
//   per-variable parameter array. Meta returns { messages: [{id}] }
//   on success; non-2xx with { error: {message, code} } on failure.

import { fetchWithRetry } from "./fetch-with-retry"

const META_BASE = "https://graph.facebook.com/v18.0"

type SendApprovalMetaArgs = {
  token: string
  phoneNumberId: string
  templateName: string
  templateLanguage: string  // e.g. "pt_BR"
  phone: string  // E.164 preferred; we send digits-only as Meta wants
  // Mapped to template body params in order: {{1}} {{2}} {{3}}.
  // Caller passes whatever fields the agency's template expects.
  // Common shape: { contactName, postTitle, approvalUrl }.
  templateParams: string[]
}

type SendResult = { ok: true; messageId?: string } | { ok: false; reason: string }

// Normalize for Meta WA API. Meta wants digits only (no +, no spaces,
// no dashes). E.164 input with + works after stripping.
function normalizePhoneForMeta(raw: string): string {
  return raw.replace(/[^\d]/g, "")
}

export async function sendApprovalRequestMeta(args: SendApprovalMetaArgs): Promise<SendResult> {
  const phone = normalizePhoneForMeta(args.phone)
  if (!phone) return { ok: false, reason: "phone vazio" }
  if (!args.templateName) return { ok: false, reason: "template_name não configurado em /settings" }

  const body = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: args.templateName,
      language: { code: args.templateLanguage || "pt_BR" },
      components: args.templateParams.length > 0
        ? [{
            type: "body",
            parameters: args.templateParams.map((value) => ({ type: "text", text: value })),
          }]
        : undefined,
    },
  }

  try {
    const res = await fetchWithRetry(`${META_BASE}/${args.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      logContext: { platform: "meta_wa", op: "send_template", phoneNumberId: args.phoneNumberId },
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok) {
      const err = data?.error
      const msg = err?.message ?? `HTTP ${res.status}`
      const sub = err?.error_subcode ? ` (subcode ${err.error_subcode})` : ""
      const code = err?.code ? ` [code ${err.code}]` : ""
      const hint = explainMetaError(err)
      return { ok: false, reason: `Meta API: ${msg}${code}${sub}.${hint ? ` ${hint}` : ""}` }
    }
    const messageId = data?.messages?.[0]?.id ?? null
    return { ok: true, messageId }
  } catch (e) {
    return { ok: false, reason: `Meta API falhou: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// Friendly translation of common Meta WhatsApp API errors so the
// agency knows what to fix without diving into FB docs.
function explainMetaError(err: any): string | null {
  const code = err?.code
  const subcode = err?.error_subcode
  if (code === 100) return "Parâmetros inválidos — confira phone_number_id + template_name."
  if (code === 131026) return "Template não aprovado (ou rascunho). Submeta pra revisão no Meta Business Manager e aguarde 24-48h."
  if (code === 131047) return "Janela de mensagem expirada — pra contatos que NÃO mandaram mensagem nas últimas 24h, só dá pra enviar via template aprovado (qual é o caso aqui — verifique o template_name)."
  if (code === 132000) return "Template não encontrado — confira o NOME exato em Meta Business Manager > WhatsApp Manager > Message Templates."
  if (code === 132001) return "Idioma do template não bate. O template foi aprovado em outro idioma — confira metaTemplateLanguage."
  if (code === 132005) return "Número de variáveis no template não bate com os parâmetros enviados. Recreate o template com 3 variáveis ({{1}} {{2}} {{3}}) ou ajuste os parâmetros."
  if (code === 132012) return "Categoria do template mudou pra MARKETING e o destinatário não está opt-in. Cria um template UTILITY (aprovação de conteúdo qualifica)."
  if (code === 133010) return "Número não registrado no Cloud API. Em WhatsApp Manager → Configurações → Verificação em duas etapas, defina um PIN de 6 dígitos; depois POST /v18.0/{phone_number_id}/register com {messaging_product:'whatsapp', pin:'XXXXXX'} usando o mesmo token. Só precisa fazer uma vez."
  if (code === 190) return "Token expirou ou foi revogado. Gere um novo permanent System User token em Meta Business Settings."
  if (subcode === 2018109) return "Phone Number ID não pertence à WABA do token. Confira que ambos vêm da mesma conta no Meta."
  return null
}

// One-time onboarding: registers a phone with Cloud API. Required after
// the number is added/verified on the WABA but before /messages works.
// First call sets the 2FA PIN to whatever the caller passes; subsequent
// calls (e.g. re-register after a long pause) must pass the existing
// PIN. Idempotent on Meta's side — re-calling with the right PIN
// returns success.
//
// PIN must be 6 digits. Meta also blocks brute-force: too many wrong
// PIN attempts lock the number for ~12h (code 133008).
export async function registerMetaPhone(
  token: string,
  phoneNumberId: string,
  pin: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!token || !phoneNumberId) return { ok: false, reason: "token ou phone_number_id vazios" }
  if (!/^\d{6}$/.test(pin)) return { ok: false, reason: "PIN deve ter 6 dígitos numéricos" }
  try {
    const res = await fetchWithRetry(`${META_BASE}/${phoneNumberId}/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
      logContext: { platform: "meta_wa", op: "register_phone", phoneNumberId },
      maxRetries: 0,
      timeoutMs: 15_000,
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok) {
      const err = data?.error
      const msg = err?.message ?? `HTTP ${res.status}`
      const codeStr = err?.code ? ` [code ${err.code}]` : ""
      const hint = explainRegisterError(err)
      return { ok: false, reason: `Meta API: ${msg}${codeStr}.${hint ? ` ${hint}` : ""}` }
    }
    // Meta returns { success: true } on register success.
    if (data?.success === true) return { ok: true }
    return { ok: false, reason: `Resposta inesperada: ${JSON.stringify(data)}` }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

function explainRegisterError(err: any): string | null {
  const code = err?.code
  if (code === 133005) return "PIN não bate com o 2FA já configurado. Use o PIN que foi definido quando o número foi cadastrado (ou desative + reative o 2FA no WhatsApp Manager pra redefinir)."
  if (code === 133006) return "PIN inválido — deve ter 6 dígitos numéricos."
  if (code === 133008) return "Muitas tentativas falhas. Meta bloqueou tentativas de PIN por ~12h. Espera e tenta de novo, ou redefine o 2FA no WhatsApp Manager."
  if (code === 133011) return "Número precisa de OTP de verificação primeiro (registrar em Cloud API só rola depois que o número está confirmado na WABA)."
  if (code === 190) return "Token expirou ou foi revogado."
  return null
}

// Validates the credentials without sending a message — calls
// GET /v18.0/{phoneNumberId} which returns the WABA's metadata. Used
// by the /settings "Testar credenciais" button before persisting.
export async function validateMetaCreds(token: string, phoneNumberId: string): Promise<{
  ok: true
  displayPhoneNumber: string
  verifiedName: string
} | { ok: false; reason: string }> {
  if (!token || !phoneNumberId) return { ok: false, reason: "token ou phone_number_id vazios" }
  try {
    const res = await fetchWithRetry(`${META_BASE}/${phoneNumberId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      logContext: { platform: "meta_wa", op: "validate_creds", phoneNumberId },
      // Validate is interactive — user is waiting. No retries (validation
      // failure should be deterministic from credentials, not transient).
      maxRetries: 0,
      timeoutMs: 10_000,
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok) {
      const err = data?.error
      return { ok: false, reason: `${err?.message ?? `HTTP ${res.status}`}${err?.code ? ` [code ${err.code}]` : ""}` }
    }
    return {
      ok: true,
      displayPhoneNumber: data?.display_phone_number ?? "(sem número)",
      verifiedName: data?.verified_name ?? "(sem nome verificado)",
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

// Deep diagnostic: validateMetaCreds only checks "can read the phone".
// This goes further — introspects the TOKEN (via /debug_token) and the
// PHONE→WABA mapping, then cross-references. Catches the classic
// "phone_number_id is from Meta's test WABA but the System User token
// only covers the agency's real WABA" trap (which surfaces as code 200
// at send time with a generic "necessary permissions" message).
//
// Returns a flat structure with one ok/reason per check + a top-level
// `summary` that names the likely fix. The UI maps each section to a
// row with ✓/✗ icon so the agency can see at a glance which gate failed.

export type MetaDiagnosis = {
  // True only when all three sections pass + the WABA-of-phone matches
  // the WABA the token can act on.
  ok: boolean
  summary: string
  token: {
    ok: boolean
    appId: string | null
    expiresAt: number | null
    expiresLabel: string
    scopes: string[]
    hasMessagingScope: boolean
    hasManagementScope: boolean
    // WABA IDs the token is granted to message on behalf of (parsed
    // from `granular_scopes` of the whatsapp_business_messaging entry).
    // Empty array = token has the scope name but no asset assigned to
    // it = will fail with code 200 on send.
    messagingTargetWabaIds: string[]
    reason: string | null
  }
  phone: {
    ok: boolean
    displayPhoneNumber: string | null
    verifiedName: string | null
    wabaId: string | null
    isMetaTestNumber: boolean
    reason: string | null
  }
  // Cross-check: does phone.wabaId appear in token.messagingTargetWabaIds?
  match: {
    ok: boolean | null  // null when either side failed and we can't compare
    reason: string
  }
}

export async function diagnoseMeta(token: string, phoneNumberId: string): Promise<MetaDiagnosis> {
  const result: MetaDiagnosis = {
    ok: false,
    summary: "",
    token: {
      ok: false, appId: null, expiresAt: null, expiresLabel: "",
      scopes: [], hasMessagingScope: false, hasManagementScope: false,
      messagingTargetWabaIds: [], reason: null,
    },
    phone: {
      ok: false, displayPhoneNumber: null, verifiedName: null,
      wabaId: null, isMetaTestNumber: false, reason: null,
    },
    match: { ok: null, reason: "" },
  }

  if (!token || !phoneNumberId) {
    result.summary = "token ou phone_number_id vazios"
    return result
  }

  // 1) Token introspection. Self-inspection (input_token=access_token=token)
  // works for User and System User tokens. Returns app_id, expires_at,
  // scopes, granular_scopes.
  try {
    const url = `${META_BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
    const res = await fetchWithRetry(url, {
      method: "GET",
      logContext: { platform: "meta_wa", op: "debug_token", phoneNumberId },
      maxRetries: 0,
      timeoutMs: 10_000,
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok || !data?.data) {
      const err = data?.error
      result.token.reason = `${err?.message ?? `HTTP ${res.status}`}${err?.code ? ` [code ${err.code}]` : ""}`
    } else {
      const td = data.data
      result.token.appId = td.app_id ? String(td.app_id) : null
      result.token.expiresAt = typeof td.expires_at === "number" ? td.expires_at : null
      // expires_at = 0 means "never expires" (permanent System User token)
      if (result.token.expiresAt === 0 || result.token.expiresAt === null) {
        result.token.expiresLabel = "permanente (não expira)"
      } else {
        const ms = result.token.expiresAt * 1000
        const date = new Date(ms)
        result.token.expiresLabel = ms > Date.now()
          ? `expira em ${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR")}`
          : `EXPIROU em ${date.toLocaleDateString("pt-BR")}`
      }
      result.token.scopes = Array.isArray(td.scopes) ? td.scopes : []
      result.token.hasMessagingScope = result.token.scopes.includes("whatsapp_business_messaging")
      result.token.hasManagementScope = result.token.scopes.includes("whatsapp_business_management")
      // granular_scopes is the per-scope asset list. Each entry:
      // { scope: "whatsapp_business_messaging", target_ids: ["123…","456…"] }
      const gs: any[] = Array.isArray(td.granular_scopes) ? td.granular_scopes : []
      const messagingEntry = gs.find((g) => g?.scope === "whatsapp_business_messaging")
      result.token.messagingTargetWabaIds = Array.isArray(messagingEntry?.target_ids)
        ? messagingEntry.target_ids.map(String)
        : []
      const expiredOrInvalid = td.is_valid === false || (result.token.expiresAt && result.token.expiresAt * 1000 < Date.now())
      result.token.ok = !expiredOrInvalid && result.token.hasMessagingScope
      if (expiredOrInvalid) result.token.reason = "token inválido/expirado"
      else if (!result.token.hasMessagingScope) result.token.reason = "scope whatsapp_business_messaging não está no token"
    }
  } catch (e) {
    result.token.reason = e instanceof Error ? e.message : String(e)
  }

  // 2) Phone introspection. The `whatsapp_business_account` reverse
  // edge on phone_number was deprecated in newer Graph versions
  // (returns code 100 "nonexisting field" on v18+). Instead:
  //   a) get phone basics directly,
  //   b) for each WABA the token can act on (from granular_scopes),
  //      list its phone_numbers and check if ours is in there.
  // Bonus: this also catches "token has WABA X but phone belongs to
  // WABA Y" without trusting a reverse edge that Meta moved.
  try {
    const url = `${META_BASE}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`
    const res = await fetchWithRetry(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      logContext: { platform: "meta_wa", op: "diagnose_phone", phoneNumberId },
      maxRetries: 0,
      timeoutMs: 10_000,
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok) {
      const err = data?.error
      result.phone.reason = `${err?.message ?? `HTTP ${res.status}`}${err?.code ? ` [code ${err.code}]` : ""}`
    } else {
      result.phone.displayPhoneNumber = data?.display_phone_number ?? null
      result.phone.verifiedName = data?.verified_name ?? null
      const display = (result.phone.displayPhoneNumber ?? "").replace(/\s+/g, "")
      result.phone.isMetaTestNumber = display.startsWith("+1555")
      result.phone.ok = !!result.phone.displayPhoneNumber
      if (!result.phone.displayPhoneNumber) result.phone.reason = "phone_number_id sem dados — confira o ID"
    }
  } catch (e) {
    result.phone.reason = e instanceof Error ? e.message : String(e)
  }

  // 2b) Discover phone's WABA by listing phone_numbers of each WABA
  // the token can reach. Only worth attempting when token has
  // messaging WABAs (otherwise the cross-check below already fails on
  // empty targets). Tolerates per-WABA errors — one bad WABA shouldn't
  // hide info from others.
  if (result.phone.ok && result.token.messagingTargetWabaIds.length > 0) {
    for (const wabaId of result.token.messagingTargetWabaIds) {
      try {
        const url = `${META_BASE}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number&limit=50`
        const res = await fetchWithRetry(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          logContext: { platform: "meta_wa", op: "list_waba_phones", wabaId },
          maxRetries: 0,
          timeoutMs: 10_000,
        })
        const data: any = await res.json().catch(() => null)
        if (!res.ok) continue
        const phones: any[] = Array.isArray(data?.data) ? data.data : []
        if (phones.some((p) => String(p?.id) === phoneNumberId)) {
          result.phone.wabaId = wabaId
          break
        }
      } catch {
        // ignore — next WABA
      }
    }
  }

  // 3) Cross-check. Three buckets:
  //   - Token has 0 messaging WABAs → primary failure mode (the
  //     token either wasn't bound to any WABA at generation time, or
  //     is a Facebook Login user token with the scope but no asset).
  //   - We FOUND phone inside a token's WABA → match (wabaId got set
  //     by the discovery loop in 2b).
  //   - Token has WABAs but phone wasn't in any of them → real
  //     mismatch (most often the "test phone / real WABA" trap).
  if (result.token.ok && result.phone.ok) {
    if (result.token.messagingTargetWabaIds.length === 0) {
      result.match.ok = false
      result.match.reason = "Token tem o scope whatsapp_business_messaging mas NENHUMA WABA atribuída a esse scope. Esse é o motivo do envio falhar — Meta não sabe em nome de qual WABA mandar. Em Business Settings → Usuários do sistema → seu System User → Atribuir ativos → Contas do WhatsApp, marque a WABA com 'Enviar mensagens' e gere um NOVO token (System User, expiração Nunca)."
    } else if (result.phone.wabaId && result.token.messagingTargetWabaIds.includes(result.phone.wabaId)) {
      result.match.ok = true
      result.match.reason = `Phone Number ID pertence à WABA ${result.phone.wabaId}, que está nos assets do token.`
    } else {
      result.match.ok = false
      const testHint = result.phone.isMetaTestNumber
        ? " — esse Phone Number ID é do NÚMERO DE TESTE da Meta (+1 555…), que pertence a uma WABA que a Meta administra, não a sua. Troque para o Phone Number ID do seu número real em Meta App → WhatsApp → Configuração da API → dropdown 'De'."
        : ""
      result.match.reason = `Phone Number ID NÃO está em nenhuma das WABAs do token (${result.token.messagingTargetWabaIds.join(", ")}).${testHint}`
    }
  } else {
    result.match.ok = null
    result.match.reason = "Não foi possível comparar — token ou phone não introspeccionaram."
  }

  result.ok = result.token.ok && result.phone.ok && result.match.ok === true

  // Pick the single most actionable line for the summary.
  if (result.ok) {
    result.summary = `Tudo certo: token vale pra WABA ${result.phone.wabaId} (${result.phone.displayPhoneNumber}).`
  } else if (!result.token.ok) {
    result.summary = `Token: ${result.token.reason ?? "falha"}`
  } else if (!result.phone.ok) {
    result.summary = `Phone Number ID: ${result.phone.reason ?? "falha"}`
  } else if (result.match.ok === false) {
    result.summary = result.match.reason
  }

  return result
}
