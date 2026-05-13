// Meta WhatsApp Cloud dispatcher. Agency-level config (one WABA per
// user) lives in userWhatsappConfig. Caller loads the config + passes
// it in — keeps this layer dumb so callers can decide what to do
// when the user hasn't configured WhatsApp (skip vs. surface error).

import { eq } from "drizzle-orm"
import { db } from "./db"
import { userWhatsappConfig } from "./db/schema"
import { sendApprovalRequestMeta } from "./whatsapp-meta"

export type UserWhatsappConfig = {
  metaWaToken: string | null
  metaPhoneNumberId: string | null
  metaTemplateName: string | null
  metaTemplateLanguage: string
}

export type DispatchArgs = {
  config: UserWhatsappConfig
  phone: string
  contactName?: string | null
  postTitle: string
  approvalUrl: string
}

export type DispatchResult =
  | { ok: true; messageId: string | null }
  | { ok: false; reason: string }

export async function dispatchApprovalRequest(args: DispatchArgs): Promise<DispatchResult> {
  const { metaWaToken, metaPhoneNumberId, metaTemplateName, metaTemplateLanguage } = args.config
  if (!metaWaToken || !metaPhoneNumberId || !metaTemplateName) {
    return {
      ok: false,
      reason: "WhatsApp não configurado em /settings → WhatsApp da agência (faltam token, phone_number_id ou template).",
    }
  }
  const result = await sendApprovalRequestMeta({
    token: metaWaToken,
    phoneNumberId: metaPhoneNumberId,
    templateName: metaTemplateName,
    templateLanguage: metaTemplateLanguage,
    phone: args.phone,
    // Template params by position: {{1}} contactName, {{2}} postTitle,
    // {{3}} approvalUrl. Empty contactName renders blank without error.
    templateParams: [args.contactName ?? "", args.postTitle, args.approvalUrl],
  })
  return result.ok
    ? { ok: true, messageId: result.messageId ?? null }
    : { ok: false, reason: result.reason }
}

// Loads the WhatsApp config for an agency owner. Returns a row with
// nulls when the user hasn't configured anything yet — callers should
// check isConfigured() (or pass directly to dispatch which surfaces
// the friendly error).
export async function getUserWhatsappConfig(userId: string): Promise<UserWhatsappConfig> {
  const [row] = await db
    .select({
      metaWaToken: userWhatsappConfig.metaWaToken,
      metaPhoneNumberId: userWhatsappConfig.metaPhoneNumberId,
      metaTemplateName: userWhatsappConfig.metaTemplateName,
      metaTemplateLanguage: userWhatsappConfig.metaTemplateLanguage,
    })
    .from(userWhatsappConfig)
    .where(eq(userWhatsappConfig.userId, userId))
  return row ?? {
    metaWaToken: null,
    metaPhoneNumberId: null,
    metaTemplateName: null,
    metaTemplateLanguage: "pt_BR",
  }
}

export function isConfigured(config: UserWhatsappConfig): boolean {
  return !!config.metaWaToken && !!config.metaPhoneNumberId && !!config.metaTemplateName
}
