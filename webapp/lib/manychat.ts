// ManyChat REST API wrapper for sending the approval-request flow.
// Docs: https://api.manychat.com/swagger
//
// Flow at agency setup:
//   1. Agency creates a flow in ManyChat with a "approval_url" custom field
//      placeholder. Flow contains a WA template message with a button that
//      opens the approval page.
//   2. Agency stores the flow's namespace ID + a Page Access Token in the
//      `client` table (manychatApprovalFlowNs + manychatApiKey).
//
// Per approval-request:
//   1. Look up the subscriber by phone — GET (NOT POST) on
//      /fb/subscriber/findByCustomField?field_name=phone&field_value=…
//      and /wa/subscriber/findByPhone?phone=…
//      ManyChat returns 405 "Wrong request method" for POST here.
//   2. With the subscriber id, POST /fb/subscriber/setCustomFields then
//      POST /fb/sending/sendFlow with the flow namespace.
//
// Returns ok=true on success. On any failure (subscriber not found, API
// rejection, network), returns ok=false with reason — caller falls back
// to email.

const MANYCHAT_BASE = "https://api.manychat.com"

type SendApprovalArgs = {
  apiKey: string
  flowNs: string
  phone: string  // E.164 preferred but ManyChat tolerates digits-only
  customFields?: Record<string, string>
}

type SendResult = { ok: true } | { ok: false; reason: string }

// Normalize phone for ManyChat's findByPhone — accepts E.164 with or
// without the leading +. We add + if missing and strip non-digits/+.
function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, "")
  if (!cleaned) return ""
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`
}

export async function sendApprovalRequest(args: SendApprovalArgs): Promise<SendResult> {
  const phone = normalizePhone(args.phone)
  if (!phone) return { ok: false, reason: "phone vazio" }

  // Variants we try, in priority order. ManyChat stores WhatsApp
  // subscribers under different formats depending on how they were
  // imported — typically with + but sometimes digits-only. We attempt
  // both before giving up so a single import-format quirk doesn't
  // make the dispatch fail silently.
  const phoneVariants = Array.from(new Set([
    phone,                           // "+5511944459535"
    phone.replace(/^\+/, ""),        // "5511944459535"
    phone.replace(/[^\d]/g, ""),     // digits only (same as above for E.164)
  ])).filter(Boolean)

  // Subscriber lookup. We only use ManyChat's WhatsApp endpoint here —
  // the Messenger findByCustomField path was removed in 2026-05-12 after
  // it consistently returned 400 (it expects a numeric field_id of a
  // custom field, not the system "phone" by name — and it wouldn't help
  // for WA channel subscribers anyway).
  let subscriberId: number | null = null
  const lookupErrors: string[] = []

  for (const candidate of phoneVariants) {
    if (subscriberId) break
    try {
      const qs = new URLSearchParams({ phone: candidate })
      const res = await fetch(`${MANYCHAT_BASE}/wa/subscriber/findByPhone?${qs}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${args.apiKey}` },
      })
      const data: any = await res.json().catch(() => null)
      if (res.ok && data?.data?.id) {
        subscriberId = data.data.id
      } else if (!res.ok) {
        lookupErrors.push(`wa/findByPhone "${candidate}" → ${res.status}: ${data?.message ?? data?.details ?? "no body"}`)
      } else if (data && !data?.data?.id) {
        lookupErrors.push(`wa/findByPhone "${candidate}" → 200 but no subscriber data`)
      }
    } catch (e) {
      lookupErrors.push(`wa/findByPhone "${candidate}" threw: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (!subscriberId) {
    // 404 from wa/findByPhone almost always means the contact never
    // messaged this WA Business number, so ManyChat doesn't have them
    // as a subscriber yet. ManyChat WA can ONLY target subscribers —
    // there's no "send to a cold number" mode via API. Spell this out
    // so the agency knows the fix is on the contact's side (or use a
    // WA template via Meta directly, outside ManyChat).
    const detail = lookupErrors.length > 0 ? ` Detalhes técnicos: ${lookupErrors.join(" | ")}` : ""
    return {
      ok: false,
      reason: `Subscriber não encontrado no ManyChat (tentei ${phoneVariants.join(", ")}). Causa mais comum: o contato NUNCA mandou mensagem pro seu número WhatsApp Business — ManyChat só conhece quem deu opt-in primeiro. Peça pro contato mandar "oi" pro seu WA business uma vez; aí ele vira subscriber e o disparo automático passa a funcionar.${detail}`,
    }
  }

  // Step 2 — set custom fields and send the flow.
  // ManyChat's sendFlow accepts a flow_ns and uses the subscriber's saved
  // custom fields. We pre-set our fields then trigger the flow.
  if (args.customFields && Object.keys(args.customFields).length > 0) {
    try {
      const res = await fetch(`${MANYCHAT_BASE}/fb/subscriber/setCustomFields`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscriber_id: subscriberId,
          fields: Object.entries(args.customFields).map(([field_name, field_value]) => ({
            field_name,
            field_value,
          })),
        }),
      })
      // ManyChat returns 200 with status:error when a field name doesn't
      // exist on the page. Without this check we'd silently skip variable
      // injection and the WA template would render with empty placeholders.
      const data: any = await res.json().catch(() => null)
      if (!res.ok || data?.status !== "success") {
        const reason = data?.message || data?.error || `HTTP ${res.status}`
        return { ok: false, reason: `setCustomFields rejeitou: ${typeof reason === "string" ? reason : JSON.stringify(reason).slice(0, 200)}. Verifique se os custom fields (${Object.keys(args.customFields).join(", ")}) estão criados na página ManyChat.` }
      }
    } catch (e) {
      return { ok: false, reason: `setCustomFields falhou: ${e}` }
    }
  }

  try {
    const res = await fetch(`${MANYCHAT_BASE}/fb/sending/sendFlow`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscriber_id: subscriberId,
        flow_ns: args.flowNs,
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => "")
      return { ok: false, reason: `sendFlow ${res.status}: ${t.slice(0, 200)}` }
    }
    const data: any = await res.json().catch(() => null)
    if (data?.status !== "success") {
      return { ok: false, reason: `sendFlow não retornou success: ${JSON.stringify(data).slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: `sendFlow falhou: ${e}` }
  }
}

// Validates a ManyChat API key by hitting /fb/page/getInfo. Returns
// the page name + WhatsApp number (when connected) so the agency UI
// can confirm "yes, this token is valid for X". ManyChat keys are
// per-page, so a successful response also tells you WHICH page the
// key controls — useful when the agency manages multiple pages.
//
// Note: ManyChat does NOT offer OAuth — only Personal API Tokens, one
// per page. Auto-listing flows or Meta-approved WhatsApp templates is
// not exposed by their public API. The agency creates the flow in
// ManyChat (which uses their pre-approved template) and pastes the
// flow namespace; we only trigger it.
export type ManychatPageInfo = {
  ok: true
  page: {
    name: string
    id: string | number | null
    timezone: string | null
    avatarLink: string | null
  }
} | {
  ok: false
  reason: string
}

export async function validateManychatToken(apiKey: string): Promise<ManychatPageInfo> {
  if (!apiKey || !apiKey.trim()) return { ok: false, reason: "API key vazio" }
  try {
    const res = await fetch(`${MANYCHAT_BASE}/fb/page/getInfo`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok || data?.status !== "success") {
      const reason = data?.message || data?.error || `HTTP ${res.status}`
      return { ok: false, reason: typeof reason === "string" ? reason : JSON.stringify(reason).slice(0, 200) }
    }
    const page = data.data ?? {}
    return {
      ok: true,
      page: {
        name: page.name ?? page.title ?? "(sem nome)",
        id: page.id ?? null,
        timezone: page.timezone ?? null,
        avatarLink: page.avatar_link ?? null,
      },
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

// Builds a wa.me click-to-chat URL with a pre-filled message.
// Used by the agency UI as a fallback button when ManyChat fails or
// isn't configured. Phone gets normalized to digits only (wa.me's
// expected format — no plus sign).
export function buildWhatsAppClickToChatUrl(phone: string, message: string): string | null {
  const digits = phone.replace(/\D/g, "")
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

// Validates phone for E.164 sanity. ManyChat's findByPhone silently
// returns "not found" when phones don't have country code, so a typo
// in the Notion contact DB results in sentVia='none' with no obvious
// reason. This check catches the common mistakes (no country code,
// too short/long, letters mixed in) BEFORE the ManyChat round-trip.
//
// Returns:
//   { valid: true } — looks like a real phone (≥10 digits, max 15)
//   { valid: false, reason } — explain why so the agency UI can fix it
export function validatePhoneE164(raw: string): { valid: true } | { valid: false; reason: string } {
  if (!raw || !raw.trim()) return { valid: false, reason: "telefone vazio" }
  const cleaned = raw.replace(/[^\d+]/g, "")
  const digitsOnly = cleaned.replace(/\D/g, "")
  // Letters/symbols beyond + are noise the agency probably typed by accident.
  if (raw.match(/[a-z]/i)) return { valid: false, reason: "telefone tem letras" }
  // E.164: 1–3 digit country code + subscriber number = 7–15 digits total.
  // Brazil real-world: +55 + 11 digits = 13 total; we accept 10+ to allow
  // tests against truncated CPFs etc. Below 10 is almost certainly bad.
  if (digitsOnly.length < 10) return { valid: false, reason: `só ${digitsOnly.length} dígitos (mínimo 10)` }
  if (digitsOnly.length > 15) return { valid: false, reason: `${digitsOnly.length} dígitos (máximo 15)` }
  // Most agencies forget the country code. If the phone doesn't start
  // with a + AND has no leading country code (BR=55, US=1), warn.
  // Heuristic: BR mobile starts with 55 + 9X. Strip leading + first.
  const noPlus = cleaned.replace(/^\+/, "")
  // 11-digit Brazilian without country code (e.g. "11999999999"). Tell
  // the user to add +55. We don't auto-fix because some agencies do
  // serve other countries.
  if (!cleaned.startsWith("+") && noPlus.length === 11 && /^[1-9]/.test(noPlus)) {
    return { valid: false, reason: "falta o código do país (ex: +55 para Brasil)" }
  }
  return { valid: true }
}

// ─── List flows ────────────────────────────────────────
// Returns the page's existing Flows so the UI can render a dropdown
// instead of asking the user to copy/paste the flow_ns string. Same
// auth as validateManychatToken — Bearer page API key.
//
// Endpoint: GET /fb/page/getFlows
// Response shape: { status: "success", data: { flows: [{ ns, name, folder_id, ... }] } }
export type ManychatFlow = { ns: string; name: string; folderName: string | null }

export type ListFlowsResult =
  | { ok: true; flows: ManychatFlow[] }
  | { ok: false; reason: string }

export async function listManychatFlows(apiKey: string): Promise<ListFlowsResult> {
  if (!apiKey?.trim()) return { ok: false, reason: "API key vazio" }
  try {
    const res = await fetch(`${MANYCHAT_BASE}/fb/page/getFlows`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok || data?.status !== "success") {
      const reason = data?.message || data?.error || `HTTP ${res.status}`
      return { ok: false, reason: typeof reason === "string" ? reason : JSON.stringify(reason).slice(0, 200) }
    }
    const flowsRaw = data.data?.flows ?? data.flows ?? []
    const folders = data.data?.folders ?? []
    const folderById = new Map<number | string, string>(
      Array.isArray(folders) ? folders.map((f: any) => [f.id, f.name as string]) : []
    )
    const flows: ManychatFlow[] = (Array.isArray(flowsRaw) ? flowsRaw : [])
      .map((f: any) => ({
        ns: typeof f.ns === "string" ? f.ns : "",
        name: typeof f.name === "string" ? f.name : "(sem nome)",
        folderName: f.folder_id ? folderById.get(f.folder_id) ?? null : null,
      }))
      .filter((f: ManychatFlow) => f.ns)
    return { ok: true, flows }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Erro de rede" }
  }
}
