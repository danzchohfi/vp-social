import { pgTable, text, timestamp, boolean, uniqueIndex, integer } from "drizzle-orm/pg-core"

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

// ─── Cliente (perfis multi-tenant) ───────────────────────────────────

export const client = pgTable("client", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const clientMember = pgTable("client_member", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
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
  token: text("token").notNull().unique(),
  invitedByUserId: text("invited_by_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  acceptedAt: timestamp("accepted_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// ─── Notion connections ────────────────────────────────────────

export const notionConnection = pgTable("notion_connection", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => client.id, { onDelete: "set null" }),
  workspaceId: text("workspace_id").notNull(),
  workspaceName: text("workspace_name").notNull(),
  workspaceIcon: text("workspace_icon"),
  accessToken: text("access_token").notNull(),
  botId: text("bot_id"),
  databaseId: text("database_id"),
  databaseName: text("database_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqUserClientWorkspace: uniqueIndex("notion_connection_user_client_workspace_uniq").on(t.userId, t.clientId, t.workspaceId),
}))

// ─── Instagram / multi-platform accounts ────────────────────────

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// ─── Publish log ──────────────────────────────────────

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
  status: text("status").notNull(),
  error: text("error"),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  metricsLastSyncedAt: timestamp("metrics_last_synced_at"),
  metricsLikes: integer("metrics_likes"),
  metricsComments: integer("metrics_comments"),
  metricsReach: integer("metrics_reach"),
  metricsSaves: integer("metrics_saves"),
  metricsImpressions: integer("metrics_impressions"),
})
