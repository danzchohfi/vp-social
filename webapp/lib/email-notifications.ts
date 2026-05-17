import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// Lightweight email helper for publish-failure notifications + invite
// emails. Reuses the same Resend setup the auth flow uses for password
// resets — no new dependency. Best-effort: failures are logged and
// swallowed so they never break the calling flow.

type FailedPublish = {
  postTitle: string | null
  conta: string | null
  platform: string | null
  error: string | null
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://producao.app"
const RESEND_FROM = process.env.RESEND_FROM ?? "Produção <contato@producao.app>"

async function sendEmail(to: string, subject: string, html: string, label: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[${label} — dev only] to=${to} subject="${subject}"`)
    return
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
    })
    if (!res.ok) {
      console.error(`[${label}] Resend rejected for ${to}: ${res.status} ${await res.text()}`)
    }
  } catch (e) {
    console.error(`[${label}] error for ${to}:`, e)
  }
}

// Lead capture from /demo form. Single recipient (founder inbox)
// until a CRM/ManyChat integration ships. Best-effort: silently
// logs in dev (no RESEND_API_KEY) so the form still completes.
const DEMO_LEAD_EMAIL = process.env.DEMO_LEAD_EMAIL ?? "daniel@vitaminapublicitaria.com.br"

export type DemoLead = {
  name: string
  email: string
  phone: string
  agencyName?: string | null
  clientCount?: string | null
  planningTool?: string | null
  comments?: string | null
  source?: string | null
}

export async function notifyDemoRequest(lead: DemoLead): Promise<void> {
  const safe = (s: string | null | undefined) =>
    (s ?? "").toString().replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))

  const html = `
<div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1A1612; background: #F5F1EA;">
  <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 4px;">Novo lead — pedido de demo</h1>
  <p style="font-size: 13px; color: #665B52; margin: 0 0 24px;">producao.app/demo · ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>

  <table style="width:100%; border-collapse: collapse; font-size: 14px;">
    <tr><td style="padding:8px 0; color:#665B52; width:160px;">Nome</td><td style="padding:8px 0; font-weight:500;">${safe(lead.name)}</td></tr>
    <tr><td style="padding:8px 0; color:#665B52;">E-mail</td><td style="padding:8px 0;"><a href="mailto:${safe(lead.email)}" style="color:#CC785C;">${safe(lead.email)}</a></td></tr>
    <tr><td style="padding:8px 0; color:#665B52;">WhatsApp</td><td style="padding:8px 0;"><a href="https://wa.me/${safe(lead.phone).replace(/\D/g, "")}" style="color:#CC785C;">${safe(lead.phone)}</a></td></tr>
    <tr><td style="padding:8px 0; color:#665B52;">Agência</td><td style="padding:8px 0;">${safe(lead.agencyName) || "—"}</td></tr>
    <tr><td style="padding:8px 0; color:#665B52;">Qtd clientes</td><td style="padding:8px 0;">${safe(lead.clientCount) || "—"}</td></tr>
    <tr><td style="padding:8px 0; color:#665B52;">Planning hoje</td><td style="padding:8px 0;">${safe(lead.planningTool) || "—"}</td></tr>
    ${lead.comments ? `<tr><td style="padding:8px 0; color:#665B52; vertical-align:top;">Comentário</td><td style="padding:8px 0; white-space:pre-wrap;">${safe(lead.comments)}</td></tr>` : ""}
    ${lead.source ? `<tr><td style="padding:8px 0; color:#665B52;">Origem</td><td style="padding:8px 0;">${safe(lead.source)}</td></tr>` : ""}
  </table>

  <p style="font-size: 12px; color: #665B52; margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5DDD0;">
    Lead recebido via producao.app · responda em 24h pra maximizar conversão.
  </p>
</div>`.trim()

  await sendEmail(
    DEMO_LEAD_EMAIL,
    `Demo · ${lead.name}${lead.agencyName ? ` (${lead.agencyName})` : ""}`,
    html,
    "demo-lead",
  )
}

export async function notifyPublishFailure(
  userId: string,
  clientName: string | null,
  failure: FailedPublish
): Promise<void> {
  // Look up the user's email. We only notify the post owner (single recipient)
  // — multi-member notifications would need a preference layer first.
  const [u] = await db.select({ email: userTable.email, name: userTable.name }).from(userTable).where(eq(userTable.id, userId))
  if (!u?.email) return

  const subject = `Falha ao publicar: ${failure.postTitle || "post sem título"}`
  const platform = failure.platform || "—"
  const errorText = failure.error || "Sem detalhes"
  const clientLabel = clientName ? ` (${clientName})` : ""
  const link = `${APP_URL}/scheduled?filter=errors`

  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
    <h2 style="margin:0 0 16px;font-size:20px">⚠ Publicação falhou${clientLabel}</h2>
    <p style="margin:0 0 8px"><strong>Post:</strong> ${esc(failure.postTitle || "sem título")}</p>
    <p style="margin:0 0 8px"><strong>Conta:</strong> ${esc(failure.conta || "—")}</p>
    <p style="margin:0 0 8px"><strong>Plataforma:</strong> ${esc(platform)}</p>
    <div style="background:#fee;border:1px solid #fcc;border-radius:8px;padding:12px;margin:16px 0;font-family:monospace;font-size:13px;word-break:break-word">
      ${esc(errorText)}
    </div>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#5b3df5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">Ver erros no VP Social</a>
    </p>
    <p style="color:#888;font-size:12px;margin-top:32px">
      Notificado para ${esc(u.name ?? u.email)}.
    </p>
  </div>`

  await sendEmail(u.email, subject, html, "publish-failure")
}

export function notifyPublishFailureAsync(
  userId: string,
  clientName: string | null,
  failure: FailedPublish
): void {
  notifyPublishFailure(userId, clientName, failure).catch((e) => {
    console.warn("[notifyPublishFailure] background notify failed:", e)
  })
}

// ─── Client-decision notification ────────────────────────────────
// Closes the loop when the end client decides on /approve/[token]:
// pings the agency owner (post.userId) so they don't have to refresh
// /scheduled to find out. Same Resend setup, same fire-and-forget
// semantics as notifyPublishFailureAsync.
//
// Only sends on real decisions ('approved' | 'changes_requested') —
// 'expired' (the cron's synthetic marker) is internal.

type ClientDecisionEmail = {
  postTitle: string | null
  contactName: string | null
  decision: "approved" | "changes_requested"
  comment: string | null
  approvalUrl: string | null
  notionPageId: string | null
  // True quando aprovação foi tácita (cron auto-decidiu após 30d de silêncio).
  // Subject do email diferencia "✅ aprovou" (explícito) de "⏱ aprovação
  // automática" (tácita) pra agency entender a fonte da decisão.
  tacit?: boolean
}

export async function notifyClientDecision(
  userId: string,
  clientName: string | null,
  decision: ClientDecisionEmail,
): Promise<void> {
  const [u] = await db.select({ email: userTable.email, name: userTable.name }).from(userTable).where(eq(userTable.id, userId))
  if (!u?.email) return

  const verb = decision.tacit
    ? "aprovou automaticamente (sem resposta em 30 dias)"
    : decision.decision === "approved"
      ? "aprovou"
      : "pediu alterações"
  const who = decision.contactName || "Cliente"
  const titleSafe = decision.postTitle || "post sem título"
  const clientLabel = clientName ? ` (${clientName})` : ""

  const subject = decision.tacit
    ? `⏱ Aprovação automática: ${titleSafe}`
    : decision.decision === "approved"
      ? `✅ ${who} aprovou: ${titleSafe}`
      : `✏️ ${who} pediu alterações em: ${titleSafe}`

  const link = decision.notionPageId
    ? `https://www.notion.so/${decision.notionPageId.replace(/-/g, "")}`
    : `${APP_URL}/scheduled`

  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
    <h2 style="margin:0 0 12px;font-size:20px">${esc(who)} ${esc(verb)}${clientLabel ? ` <span style="color:#666;font-weight:normal">${esc(clientLabel.trim())}</span>` : ""}</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      <strong>${esc(titleSafe)}</strong>
    </p>
    ${decision.comment
      ? `<div style="background:#f5f5f7;border-radius:8px;padding:12px 14px;margin:0 0 16px">
          <p style="margin:0 0 4px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px">Comentário do cliente</p>
          <p style="margin:0;font-size:14px;line-height:1.5;white-space:pre-wrap">${esc(decision.comment)}</p>
        </div>`
      : ""}
    <p style="margin:0 0 8px">
      <a href="${esc(link)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px">Ver no Notion</a>
    </p>
    ${decision.approvalUrl
      ? `<p style="margin:8px 0 0;font-size:12px;color:#666">Link de aprovação: <a href="${esc(decision.approvalUrl)}" style="color:#666">${esc(decision.approvalUrl)}</a></p>`
      : ""}
  </div>`

  await sendEmail(u.email, subject, html, "client-decision")
}

export function notifyClientDecisionAsync(
  userId: string,
  clientName: string | null,
  decision: ClientDecisionEmail,
): void {
  notifyClientDecision(userId, clientName, decision).catch((e) => {
    console.warn("[notifyClientDecision] background notify failed:", e)
  })
}

// ─── Invite email ────────────────────────────────────

type InviteEmail = {
  to: string
  clientName: string
  inviterName: string | null
  inviterEmail: string
  inviteUrl: string
  role: "member" | "admin"
  scope: "client" | "agency"
}

export async function sendInviteEmail(opts: InviteEmail): Promise<void> {
  const roleLabel = opts.role === "admin" ? "Admin" : "Membro"
  const scopeLabel = opts.scope === "agency"
    ? `acesso de agência (todos os clientes de ${esc(opts.inviterName ?? opts.inviterEmail)})`
    : `cliente ${esc(opts.clientName)}`

  const subject = `Convite para o VP Social — ${opts.clientName}`
  const inviterDisplay = opts.inviterName ? `${esc(opts.inviterName)} (${esc(opts.inviterEmail)})` : esc(opts.inviterEmail)

  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
    <h2 style="margin:0 0 16px;font-size:20px">Você foi convidado pro VP Social</h2>
    <p style="margin:0 0 12px">${inviterDisplay} te convidou pra acessar o VP Social como <strong>${roleLabel}</strong> com ${scopeLabel}.</p>
    <p style="margin:0 0 12px">VP Social publica posts agendados no Notion para Instagram, Facebook, YouTube, TikTok e LinkedIn — tudo automático a partir do banco do Notion.</p>
    <p style="margin:24px 0">
      <a href="${opts.inviteUrl}" style="background:#5b3df5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Aceitar convite</a>
    </p>
    <p style="color:#666;font-size:13px">Ou cole este link no navegador:<br/><a href="${opts.inviteUrl}">${opts.inviteUrl}</a></p>
    <p style="color:#999;font-size:12px;margin-top:32px">O convite é válido por 7 dias e só pode ser aceito por <strong>${esc(opts.to)}</strong>. Se você não esperava este convite, pode ignorar este email.</p>
  </div>`

  await sendEmail(opts.to, subject, html, "invite")
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
