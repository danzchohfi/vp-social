// Provider-agnostic WhatsApp approval dispatcher. Reads
// client.whatsappProvider and routes to either the ManyChat flow or
// the Meta WhatsApp Cloud API direct path. Keeps every call site thin:
// the caller passes the per-dispatch fields + the client config row,
// and we figure out which provider to invoke.

import { sendApprovalRequest } from "./manychat"
import { sendApprovalRequestMeta } from "./whatsapp-meta"

export type DispatchClient = {
  whatsappProvider: string  // 'manychat' | 'meta_cloud'
  manychatApiKey: string | null
  manychatApprovalFlowNs: string | null
  metaWaToken: string | null
  metaPhoneNumberId: string | null
  metaTemplateName: string | null
  metaTemplateLanguage: string
}

export type DispatchArgs = {
  client: DispatchClient
  phone: string
  contactName?: string | null
  postTitle: string
  approvalUrl: string
  // ManyChat-only extras: passed straight as customFields when the
  // provider is ManyChat. Meta uses templateParams (positional) so
  // these are ignored on that path.
  postUrl?: string | null
}

export type DispatchResult =
  | { ok: true; provider: "manychat" | "meta_cloud"; messageId?: string | null }
  | { ok: false; provider: "manychat" | "meta_cloud" | null; reason: string }

export async function dispatchApprovalRequest(args: DispatchArgs): Promise<DispatchResult> {
  const provider = args.client.whatsappProvider === "meta_cloud" ? "meta_cloud" : "manychat"

  if (provider === "meta_cloud") {
    const { metaWaToken, metaPhoneNumberId, metaTemplateName, metaTemplateLanguage } = args.client
    if (!metaWaToken || !metaPhoneNumberId || !metaTemplateName) {
      return {
        ok: false,
        provider: "meta_cloud",
        reason: "Meta WhatsApp não configurado pra este cliente (token + phone_number_id + template_name em /settings → Aprovação cliente).",
      }
    }
    // Template params map by position: {{1}} contactName, {{2}}
    // postTitle, {{3}} approvalUrl. The agency creates the template
    // with these placeholders. Empty contactName is fine — Meta
    // renders empty text without erroring.
    const result = await sendApprovalRequestMeta({
      token: metaWaToken,
      phoneNumberId: metaPhoneNumberId,
      templateName: metaTemplateName,
      templateLanguage: metaTemplateLanguage,
      phone: args.phone,
      templateParams: [
        args.contactName ?? "",
        args.postTitle,
        args.approvalUrl,
      ],
    })
    return result.ok
      ? { ok: true, provider: "meta_cloud", messageId: result.messageId ?? null }
      : { ok: false, provider: "meta_cloud", reason: result.reason }
  }

  // Default: ManyChat path
  const { manychatApiKey, manychatApprovalFlowNs } = args.client
  if (!manychatApiKey || !manychatApprovalFlowNs) {
    return {
      ok: false,
      provider: "manychat",
      reason: "ManyChat não configurado pra este cliente (API key + Flow em /settings → Aprovação cliente).",
    }
  }
  const result = await sendApprovalRequest({
    apiKey: manychatApiKey,
    flowNs: manychatApprovalFlowNs,
    phone: args.phone,
    customFields: {
      approval_url: args.approvalUrl,
      post_title: args.postTitle,
      post_url: args.postUrl ?? "",
    },
  })
  return result.ok
    ? { ok: true, provider: "manychat" }
    : { ok: false, provider: "manychat", reason: result.reason }
}

// Maps dispatch result to approvalLink.sentVia value. Used by call
// sites to update the row after dispatch succeeds/fails.
export function sentViaForResult(result: DispatchResult): "manychat" | "meta_cloud" | "none" {
  if (!result.ok) return "none"
  return result.provider
}
