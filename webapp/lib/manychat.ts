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
