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
  // Permanent client-facing calendar token. Used in the public URL
  // /c/{token} that the agency shares with the client (one link, never
  // expires) showing pending approvals + scheduled + published posts of
  // this client. Generated lazily on first /clients/{id} request via
  // getOrCreateClientCalendarToken. Different from approvalLink.token,
  // which is short-lived and post-specific.
  publicCalendarToken: text("public_calendar_token").unique(),
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

// ─── Instagram / multi-platform accounts ──────────────────────

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqUserClientPlatformPage: uniqueIndex("instagram_account_user_client_platform_page_uniq").on(t.userId, t.clientId, t.platform, t.pageId),
}))

// ─── Field mapping ────────────────────────────────

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
  clientContactField: text("client_contact_field"),
  contactEmailField: text("contact_email_field"),
  contactPhoneField: text("contact_phone_field"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// ─── Publish log ─────────────────────────────────

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

// ─── Approval link ────────────────────────────────
// One row per pending client-approval cycle for a Notion post. The cron
// detects posts in fieldMapping.awaitingApprovalValue, creates an
// approvalLink (random token, 14d expiry), notifies the client (ManyChat
// WA + Resend email), and registers sentVia. The client opens
// /approve/{token}, sees the post preview, and posts a decision —
// approved | changes_requested | rejected. Approving flips Notion status
// to statusReadyValue (cron picks it up). Changes_requested flips to
// revisionRequestedValue + adds a comment on the Notion page via API.
export const approvalLink = pgTable("approval_link", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: text("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().references(() => notionConnection.id, { onDelete: "cascade" }),
  notionPageId: text("notion_page_id").notNull(),
  postTitle: text("post_title").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  // "manychat" | "email" | "manual" | "none". "none" means no channel
  // succeeded — agency has to nudge manually via the click-to-chat WA
  // button rendered in /scheduled.
  sentVia: text("sent_via").notNull().default("none"),
  sentAt: timestamp("sent_at"),
  expiresAt: timestamp("expires_at").notNull(),
  // null when pending. Set when client decides on the public page.
  decision: text("decision"),
  decidedAt: timestamp("decided_at"),
  decidedFromIp: text("decided_from_ip"),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  // At most one PENDING approval link per Notion page. The cron uses this
  // to avoid sending repeat notifications. Once decided (decision NOT NULL),
  // a new pending link can be created if the post re-enters the awaiting
  // state — but that's a different row.
  pendingPerPage: uniqueIndex("approval_link_pending_per_page_uniq")
    .on(t.notionPageId)
    .where(sql`${t.decision} IS NULL`),
  byClient: index("approval_link_client_idx").on(t.clientId, t.createdAt),
}))
