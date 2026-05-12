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
  if (code === 190) return "Token expirou ou foi revogado. Gere um novo permanent System User token em Meta Business Settings."
  if (subcode === 2018109) return "Phone Number ID não pertence à WABA do token. Confira que ambos vêm da mesma conta no Meta."
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
