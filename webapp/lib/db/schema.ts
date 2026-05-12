import { pgTable, text, timestamp, boolean, uniqueIndex, integer, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// ─── Better Auth tables (matches Better Auth schema) ─────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// ─── Cliente (perfis multi-tenant) ──────────────────────────────

export const client = pgTable("client", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  // ManyChat integration for client-approval WhatsApp notifications. Both
  // optional — when set, the cron uses ManyChat API to send the approval
  // request to the subscriber matching the contact's phone (read from the
  // Notion Contatos DB via fieldMapping.contactPhoneField). When not set,
  // the agency uses the click-to-chat WA button manually from /scheduled
  // (email path was removed by design — WA-only).
  manychatApiKey: text("manychat_api_key"),
  manychatApprovalFlowNs: text("manychat_approval_flow_ns"),
  // WhatsApp dispatch provider per client. ManyChat is the legacy
  // path (unreliable wa/findByPhone lookups, requires opt-in per
  // subscriber). 'meta_cloud' uses WhatsApp Cloud API direct from
  // Meta: phone IS the identifier, pre-approved templates work for
  // any number, no middleman. Default 'manychat' for backward compat
  // — existing clients keep working until they migrate via /settings.
  whatsappProvider: text("whatsapp_provider").notNull().default("manychat"),
  // Meta WhatsApp Cloud API credentials. Set when whatsappProvider
  // is 'meta_cloud'. The Phone Number ID lives under WhatsApp > API
  // Setup in the Meta App. The token MUST be a permanent System
  // User token from Meta Business Settings (not the temporary one
  // shown in API Setup — that expires in 24h).
  metaWaToken: text("meta_wa_token"),
  metaPhoneNumberId: text("meta_phone_number_id"),
  // Pre-approved message template (24-48h Meta review). Variables
  // map to {{1}}=contactName {{2}}=postTitle {{3}}=approvalUrl.
  metaTemplateName: text("meta_template_name"),
  metaTemplateLanguage: text("meta_template_language").notNull().default("pt_BR"),
  // How the agency wants to notify clients of pending approvals.
  //   'auto_manychat'   → cron dispatches via ManyChat API (needs token + flowNs)
  //   'manual_whatsapp' → cron creates the approvalLink but doesn't dispatch.
  //                       Agency clicks "Enviar via WA" in /scheduled (wa.me).
  // NULL = legacy unset; treated as auto_manychat for backward compat.
  // Surfaces in /clients ApprovalPanel as a radio + drives which fields
  // are required for the "Configurada" status pill.
  approvalNotificationMode: text("approval_notification_mode"),
  // When 'auto' (default), the cron sweep dispatches a WhatsApp per
  // pending post automatically. When 'manual', the cron still creates
  // approvalLink rows but skips dispatch — agency clicks "Notificar
  // pendentes" on /dashboard to send a single digest WhatsApp per
  // client whenever they decide it makes sense. NULL = 'auto' for
  // backward compat.
  approvalDispatchMode: text("approval_dispatch_mode"),
  // Customizable wa.me message template for the manual approval flow.
  // Placeholders: {{contact_name}}, {{post_title}}, {{approval_url}},
  // {{client_name}}. Used by the "Enviar via WA" button in /scheduled.
  // NULL = use the hardcoded default ("Olá X! Link pra você aprovar...").
  manualWhatsappTemplate: text("manual_whatsapp_template"),
  // When true, the cron skips this client entirely — no publishing, no
  // approval sweep, no analytics sync. Used for paused contracts,
  // disputes, holidays, etc. Toggled from /clients card; surfaced as
  // a banner on every client view so the agency knows publishing is off.
  publishingPaused: boolean("publishing_paused").notNull().default(false),
  // Permanent client-facing calendar token. Used in the public URL
  // /c/{token} that the agency shares with the client (one link, never
  // expires) showing pending approvals + scheduled + published posts of
  // this client. Generated lazily on first /clients/{id} request via
  // getOrCreateClientCalendarToken. Different from approvalLink.token,
  // which is short-lived and post-specific.
  publicCalendarToken: text("public_calendar_token").unique(),
  // Explicit list of Notion `conta` values (the values seen in the
  // Notion accountField multi-select / relation) that belong to this
  // client. When set, /api/notion/scheduled and trigger/publish.ts
  // route posts whose conta is in this list to THIS client — instead of
  // the implicit fuzzy-match-against-instagramAccount.conta heuristic
  // that misses cross-tenant scenarios (one Notion connection serving
  // multiple agency clients, each with its own IG accounts under
  // different VP Social client rows). Empty/null array = legacy name-
  // matching behavior. Populated via /clients/[id]/edit.
  notionContaValues: text("notion_conta_values").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const clientMember = pgTable("client_member", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  // "client" = só este cliente. "agency" = todos os clientes do mesmo owner
  // que clientId (acesso de agência).
  scope: text("scope").notNull().default("client"),
  invitedByUserId: text("invited_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqClientUser: uniqueIndex("client_member_client_user_uniq").on(t.clientId, t.userId),
}))

export const clientInvite = pgTable("client_invite", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  scope: text("scope").notNull().default("client"),
  token: text("token").notNull().unique(),
  invitedByUserId: text("invited_by_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  acceptedAt: timestamp("accepted_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// ─── Notion connections ──────────────────────────────────

export const notionConnection = pgTable("notion_connection", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => client.id, { onDelete: "set null" }),
  workspaceId: text("workspace_id").notNull(),
  workspaceName: text("workspace_name").notNull(),
  workspaceIcon: text("workspace_icon"),
  accessToken: text("access_token").notNull(),
  databaseId: text("database_id"),
  databaseName: text("database_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqUserClientWorkspace: uniqueIndex("notion_connection_user_client_workspace_uniq").on(t.userId, t.clientId, t.workspaceId),
}))

// ─── Instagram / multi-platform accounts ──────────────────────────

export const instagramAccount = pgTable("instagram_account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => client.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default("instagram"),
  platformAccountId: text("platform_account_id"),
  conta: text("conta").notNull(),
  pageId: text("page_id").notNull(),
  pageName: text("page_name").notNull(),
  pageAccessToken: text("page_access_token").notNull(),
  refreshToken: text("refresh_token"),
  instagramBusinessAccountId: text("instagram_business_account_id").notNull().default(""),
  active: boolean("active").notNull().default(true),
  // Captured the last time a refresh attempt failed (token expired,
  // revoked, scope changed). Surfaced in the dashboard banner so the
  // agency reconnects before the next publish breaks.
  lastRefreshError: text("last_refresh_error"),
  lastRefreshErrorAt: timestamp("last_refresh_error_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqUserClientPlatformPage: uniqueIndex("instagram_account_user_client_platform_page_uniq").on(t.userId, t.clientId, t.platform, t.pageId),
}))

// ─── Field mapping ────────────────────────────────────────

export const fieldMapping = pgTable("field_mapping", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().references(() => notionConnection.id, { onDelete: "cascade" }).unique(),
  // Campos de identificação
  titleField: text("title_field").notNull().default("Produção"),
  captionField: text("caption_field").notNull().default("Legenda"),
  // Onde publicar (multi-select com plataforma + formato combinados)
  publicarEmField: text("publicar_em_field").notNull().default("Publicar em"),
  // Legado: mantidos como nullable até migração ser aplicada (não usados pelo app)
  hashtagsField: text("hashtags_field"),
  tipoField: text("tipo_field"),
  plataformasField: text("plataformas_field"),
  // Mídias
  mediaVerticalField: text("media_vertical_field").notNull().default("Mídia Vertical"),
  mediaHorizontalField: text("media_horizontal_field").notNull().default("Mídia Horizontal"),
  mediaFeedField: text("media_feed_field").notNull().default("Imagens Feed"),
  thumbnailField: text("thumbnail_field").notNull().default("Thumbnail"),
  // Status
  statusField: text("status_field").notNull().default("Status"),
  statusReadyValue: text("status_ready_value").notNull().default("Agendamento"),
  statusPublishedValue: text("status_published_value").notNull().default("Publicado"),
  statusErrorValue: text("status_error_value").notNull().default("Erro"),
  // Agendamento e conta
  dateField: text("date_field").notNull().default("Dia para fazer"),
  accountField: text("account_field").notNull().default("Conta"),
  // Analytics (opcionais — propriedades Number no Notion)
  likesField: text("likes_field"),
  reachField: text("reach_field"),
  commentsField: text("comments_field"),
  savesField: text("saves_field"),
  impressionsField: text("impressions_field"),
  // Link de volta para o app (URL property no Notion). Default "Social VP";
  // o valor escrito é {NEXT_PUBLIC_APP_URL}/scheduled?postId={pageId}.
  socialVpField: text("social_vp_field").default("Social VP"),
  // URL pública do post no destino (Instagram permalink, Facebook post URL,
  // YouTube watch URL, etc.) — escrita em uma URL property do Notion após
  // o publish. Opcional: se não mapeado, nada é escrito.
  postUrlField: text("post_url_field"),
  // Approval flow — all opt-in. When awaitingApprovalValue is set, the cron
  // detects posts in that status, creates an approvalLink, and notifies the
  // client (ManyChat WA + Resend email) using contact info read from the
  // Notion post via the contact*Field rollups (which typically resolve via
  // a relation to a "Contatos" DB). When client approves on the public page
  // /approve/{token}, status flips to statusReadyValue. When client requests
  // changes, status flips to revisionRequestedValue + a comment is posted
  // on the Notion page via comments.create.
  awaitingApprovalValue: text("awaiting_approval_value"),
  revisionRequestedValue: text("revision_requested_value"),
  // Value to write on the approval property when the client approves.
  // When SET alongside approvalStatusField, the cron flips ONLY the
  // approval property to this value — it does NOT touch the publish
  // status (statusField). Lets the agency keep schedule control:
  // approval signals "production OK", scheduling is a separate beat.
  // When unset (legacy): on approve, statusField flips to
  // statusReadyValue — old behavior preserved for backward compat.
  approvedValue: text("approved_value"),
  // Optional override: when the agency keeps the approval state in a
  // *different* Notion select than the publish status (common in workspaces
  // that separate "Status produção" from "Status agendamento"), this points
  // the cron + UI at the right property. NULL = same as statusField.
  approvalStatusField: text("approval_status_field"),
  clientContactField: text("client_contact_field"),
  contactEmailField: text("contact_email_field"),
  contactPhoneField: text("contact_phone_field"),
  // Optional: name of a Checkbox property on the Contato DB. When set,
  // resolveContact filters multi-relation lists to contacts whose box is
  // marked. Lets the agency declare "this is the approver" in Notion
  // when a post links several contacts.
  contactApproverField: text("contact_approver_field"),
  // When true AND clientContactField is a rollup (Post → Conta → Contatos):
  // if the rollup yields zero Contatos (the linked Conta has none linked
  // yet), fall back to using the Conta page itself as the contact —
  // reads phone from a phone-typed field on the Conta page directly.
  // Useful for hybrid setups where some Contas have a Contatos relation
  // and others store the phone on the Conta page itself.
  // Default false = safer (no surprise dispatch to the Conta page).
  rollupFallbackToAccount: boolean("rollup_fallback_to_account").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// ─── Publish log ───────────────────────────────────

export const publishLog = pgTable("publish_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => client.id, { onDelete: "set null" }),
  connectionId: text("connection_id").references(() => notionConnection.id, { onDelete: "set null" }),
  notionPageId: text("notion_page_id").notNull(),
  postTitle: text("post_title").notNull(),
  conta: text("conta").notNull(),
  platform: text("platform"),
  instagramPostId: text("instagram_post_id"),
  platformPostId: text("platform_post_id"),
  platformPostUrl: text("platform_post_url"),
  status: text("status").notNull(),
  error: text("error"),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  metricsLastSyncedAt: timestamp("metrics_last_synced_at"),
  metricsLikes: integer("metrics_likes"),
  metricsComments: integer("metrics_comments"),
  metricsReach: integer("metrics_reach"),
  metricsSaves: integer("metrics_saves"),
  metricsImpressions: integer("metrics_impressions"),
}, (t) => ({
  // DB-level idempotency lock: at most one in-flight or successfully
  // published row per (connection, page, platform). The 'pending' state
  // is the claim-before-publish slot — a worker INSERTs a pending row
  // before calling the external API and UPDATEs to 'published' or
  // 'failed' after. The unique index makes the claim atomic: a second
  // worker racing on the same target gets a unique-violation and skips,
  // so external duplicate publishes (bug from 2026-05-08, where the user
  // got 2 extra IG Reels uploads on a single click) become physically
  // impossible. Stale pending rows are swept by cleanupStalePending.
  inflightDedup: uniqueIndex("publish_log_inflight_uniq")
    .on(t.connectionId, t.notionPageId, t.platform)
    .where(sql`${t.status} IN ('published', 'pending')`),
  // publish_log was the most-queried table with zero secondary indexes —
  // dashboard, /scheduled, /history, analytics worker all hit it.
  byClientPublished: index("publish_log_client_published_idx").on(t.clientId, t.publishedAt),
  byStatus: index("publish_log_status_idx").on(t.status),
}))

// ─── Approval link ──────────────────────────────────
// One row per pending client-approval cycle. Discriminated by `kind`:
//   - 'post': legacy Notion-page approval; uses notion_page_id, contact*
//     fields for ManyChat dispatch.
//   - 'production_script': new (May 2026); references production_id +
//     approver_id + round. Multi-step chain: each step gets its own row;
//     advanceChain creates the next step's row after current is approved.
export const approvalLink = pgTable("approval_link", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: text("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().references(() => notionConnection.id, { onDelete: "cascade" }),
  notionPageId: text("notion_page_id").notNull(),
  postTitle: text("post_title").notNull(),
  // Notion `conta` field value at link-creation time. Lets the dashboard
  // / Detalhes group pending approvals by conta within a single client
  // (the agency runs many contas under one client and wants to see
  // per-brand breakdowns without changing the routing model).
  conta: text("conta"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  // "manychat" | "email" | "manual" | "external" | "none". "none" means no
  // channel succeeded — agency has to nudge manually via the click-to-chat
  // WA button rendered in /scheduled. "external" is the Wave-3 escape hatch
  // for "client approved by phone, mark it done in the system".
  sentVia: text("sent_via").notNull().default("none"),
  sentAt: timestamp("sent_at"),
  // When dispatch fails (ManyChat subscriber not found, invalid phone,
  // API key revoked, etc.), the human-readable cause is stored here so
  // /scheduled can surface "porquê não foi enviado" without the agency
  // having to dig through Trigger.dev worker logs. Cleared on success.
  lastError: text("last_error"),
  // Set when productionApprovalReminders cron has fired a follow-up
  // ManyChat dispatch for a stale pending link (sent > 3d ago, no
  // decision, not expired). Capped at 1 reminder per link — once set,
  // the cron skips this row on subsequent ticks. Cleared if the agency
  // bumps the round (new row in chain).
  reminderSentAt: timestamp("reminder_sent_at"),
  expiresAt: timestamp("expires_at").notNull(),
  // null when pending. Set when client decides on the public page.
  decision: text("decision"),
  decidedAt: timestamp("decided_at"),
  decidedFromIp: text("decided_from_ip"),
  comment: text("comment"),
  // Discriminator + production-flow fields (Wave 1, May 2026). For
  // kind='post' these are NULL/default. For kind='production_script' the
  // productionId + approverId pair identifies which step of which chain
  // this row represents; round bumps on each rejection→reissue cycle.
  kind: text("kind").notNull().default("post"),
  productionId: text("production_id"),
  approverId: text("approver_id"),
  round: integer("round").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  // Replaces approval_link_pending_per_page_uniq. Two scoped indexes so
  // posts (legacy) and productions (multi-step chain) don't share the slot.
  pendingPostUniq: uniqueIndex("approval_link_pending_post_uniq")
    .on(t.notionPageId)
    .where(sql`${t.decision} IS NULL AND ${t.kind} = 'post'`),
  // Production: at most one pending link per (production, approver, round)
  // — multiple chain steps can be pending simultaneously (different
  // approverId), and successive rounds get distinct rows after a rejection.
  pendingProductionUniq: uniqueIndex("approval_link_pending_production_uniq")
    .on(t.productionId, t.approverId, t.round)
    .where(sql`${t.decision} IS NULL AND ${t.kind} = 'production_script' AND ${t.productionId} IS NOT NULL`),
  byClient: index("approval_link_client_idx").on(t.clientId, t.createdAt),
}))

// ─── Production (Wave 1, May 2026) ──────────────────────────────
// A long-form video/podcast piece going through brief → script → approval
// → recording → editing → delivered → published lifecycle. Distinct from
// `publishLog` (per-platform external publish records) and from Notion
// posts (Notion stays in the post pipeline; productions live entirely in
// our DB). One client can own many productions; each production has a
// chain of approvers (productionApprover) and a script body stored as
// TipTap JSON.
export const production = pgTable("production", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // "video" | "podcast" — drives some UX hints (podcasts get longer scripts,
  // different default aspect-ratio for derived clips). v1 is informational only.
  type: text("type").notNull().default("video"),
  title: text("title").notNull(),
  topic: text("topic"),
  // Specialist = the expert/talent the agency is filming. v1 keeps these
  // as flat strings; v2 will normalize into a `specialist` table when
  // the same person reappears across productions.
  specialistName: text("specialist_name"),
  specialistContactName: text("specialist_contact_name"),
  specialistContactEmail: text("specialist_contact_email"),
  specialistContactPhone: text("specialist_contact_phone"),
  // TipTap JSON. Brief = what the client wants covered (filled by client
  // via /c/[token] when status='brief_pending'). Script = body the agency
  // writes for the specialist to follow. Both nullable — empty production
  // starts as 'brief_pending' or 'script_drafting' depending on workflow.
  briefJson: text("brief_json"),
  scriptJson: text("script_json"),
  // See lib/productions.ts ProductionStatus for the full enum.
  status: text("status").notNull().default("script_drafting"),
  recordingDate: timestamp("recording_date"),
  deliveryDate: timestamp("delivery_date"),
  publishDate: timestamp("publish_date"),
  // Final URL of the edited video (Vimeo, YouTube unlisted, R2, whatever).
  // Triggers Wave-3 "create post from this production" affordance when set.
  finalVideoUrl: text("final_video_url"),
  // Optional cross-reference for users who want to mirror the production
  // back into their Notion DB after delivery. Not synced automatically.
  notionPageId: text("notion_page_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  byClient: index("production_client_idx").on(t.clientId, t.createdAt),
  byClientStatus: index("production_client_status_idx").on(t.clientId, t.status),
}))

// ─── Production comment ──────────────────────────────────
// Agency-side thread on a production. End-client comments come in via
// /approve/[token] when they request changes — those rows have authorUserId
// NULL and authorName populated from the approval token's contact name
// snapshot.
export const productionComment = pgTable("production_comment", {
  id: text("id").primaryKey(),
  productionId: text("production_id").notNull().references(() => production.id, { onDelete: "cascade" }),
  authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),
  // Fallback display name when authorUserId is NULL (client comment via
  // approval token). For agency comments, UI prefers the User's name from
  // the join; this field holds the snapshot for client comments.
  authorName: text("author_name"),
  body: text("body").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  byProduction: index("production_comment_production_idx").on(t.productionId, t.createdAt),
}))

// ─── Approver (Wave 1, May 2026) ──────────────────────────────
// Reusable contact-with-magic-link entity, scoped to the agency owner
// (NOT per-client) so the same person (e.g., Marketing Director who
// approves for Brand A and Brand B) has ONE magic token URL listing all
// their pending items across clients.
export const approver = pgTable("approver", {
  id: text("id").primaryKey(),
  // Agency owner's userId. The owner sees + manages the approvers; their
  // clientMembers can use them on productions of clients they have access
  // to but cannot edit the approver record itself.
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  // "client" | "internal_reviewer" | "final_approver" — informational
  // only in v1; future versions may use it to drive default chain templates.
  role: text("role").notNull().default("client"),
  // Long-lived passwordless token. Rotated by regenerateMagicToken when
  // an approver leaves. Format: 64 hex chars (concat of two generateId()).
  magicToken: text("magic_token").notNull().unique(),
  magicTokenIssuedAt: timestamp("magic_token_issued_at").notNull().defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  byUser: index("approver_user_idx").on(t.userId),
}))

// ─── Production ↔ Approver (chain) ────────────────────────────
// Ordered list of approvers for a production. stepOrder = 1 is dispatched
// first; advanceChain creates the next stepOrder's approvalLink only after
// the current one approves.
export const productionApprover = pgTable("production_approver", {
  productionId: text("production_id").notNull().references(() => production.id, { onDelete: "cascade" }),
  approverId: text("approver_id").notNull().references(() => approver.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
}, (t) => ({
  pk: uniqueIndex("production_approver_pk").on(t.productionId, t.approverId),
  uniqStep: uniqueIndex("production_approver_step_uniq").on(t.productionId, t.stepOrder),
}))
