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
//   1. We look up the subscriber by phone (POST /fb/subscriber/findByCustomField
//      or by phone via /wa/subscriber/findByPhone).
//   2. With the subscriber id, POST /fb/sending/sendFlow with the flow
//      namespace + custom field values { approval_url: "..." }.
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

  // Step 1 — find subscriber by phone. ManyChat's WA endpoint:
  //   POST /wa/subscriber/findByPhone   { phone }
  let subscriberId: number | null = null
  try {
    const res = await fetch(`${MANYCHAT_BASE}/fb/subscriber/findByCustomField`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ field_id: "phone", field_value: phone }),
    })
    const data: any = await res.json().catch(() => null)
    if (res.ok && data?.status === "success") {
      const list = data.data?.subscribers ?? data.data ?? []
      subscriberId = (Array.isArray(list) ? list[0]?.id : list?.id) ?? null
    }
  } catch (e) {
    return { ok: false, reason: `findByCustomField falhou: ${e}` }
  }

  if (!subscriberId) {
    // Try the WhatsApp-specific endpoint as a second attempt. Some ManyChat
    // accounts only expose this one for WA channels.
    try {
      const res = await fetch(`${MANYCHAT_BASE}/wa/subscriber/findByPhone`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone }),
      })
      const data: any = await res.json().catch(() => null)
      if (res.ok && data?.data?.id) subscriberId = data.data.id
    } catch {
      // ignore — handled below
    }
  }

  if (!subscriberId) {
    return { ok: false, reason: "subscriber não encontrado no ManyChat (cliente precisa ter iniciado conversa antes)" }
  }

  // Step 2 — set custom fields and send the flow.
  // ManyChat's sendFlow accepts a flow_ns and uses the subscriber's saved
  // custom fields. We pre-set our fields then trigger the flow.
  if (args.customFields && Object.keys(args.customFields).length > 0) {
    try {
      await fetch(`${MANYCHAT_BASE}/fb/subscriber/setCustomFields`, {
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

// Builds a wa.me click-to-chat URL with a pre-filled message.
// Used by the agency UI as a fallback button when ManyChat fails or
// isn't configured. Phone gets normalized to digits only (wa.me's
// expected format — no plus sign).
export function buildWhatsAppClickToChatUrl(phone: string, message: string): string | null {
  const digits = phone.replace(/\D/g, "")
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
