import { pgTable, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core"

// ─── Better Auth tables ───────────────────────────────

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
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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

// ─── Client (perfil de cliente da agência) ───────────────────────

export const client = pgTable("client", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// Quem tem acesso a um cliente (owner | admin | member)
export const clientMember = pgTable(
  "client_member",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("client_member_client_user").on(t.clientId, t.userId)]
)

// Convites pendentes — link compartilhado por token
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

// ─── Notion connections ───────────────────────────────────────

export const notionConnection = pgTable(
  "notion_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => client.id, { onDelete: "cascade" }),
    accessToken: text("access_token").notNull(),
    workspaceId: text("workspace_id").notNull(),
    workspaceName: text("workspace_name").notNull(),
    workspaceIcon: text("workspace_icon"),
    databaseId: text("database_id"),
    databaseName: text("database_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notion_connection_client_workspace").on(t.userId, t.clientId, t.workspaceId)]
)

// ─── Social accounts (Instagram, Facebook, YouTube, TikTok, LinkedIn) ─────

export const instagramAccount = pgTable(
  "instagram_account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => client.id, { onDelete: "cascade" }),
    platform: text("platform").notNull().default("instagram"),
    conta: text("conta").notNull(),
    pageName: text("page_name").notNull(),
    pageId: text("page_id").notNull(),
    instagramBusinessAccountId: text("instagram_business_account_id").notNull().default(""),
    platformAccountId: text("platform_account_id"),
    pageAccessToken: text("page_access_token").notNull(),
    refreshToken: text("refresh_token"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("instagram_account_client_platform_page").on(t.userId, t.clientId, t.platform, t.pageId)]
)

// ─── Field mapping ─────────────────────────────────────────────

export const fieldMapping = pgTable("field_mapping", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().references(() => notionConnection.id, { onDelete: "cascade" }).unique(),
  // Campos de identificação
  titleField: text("title_field").notNull().default("Produção"),
  captionField: text("caption_field").notNull().default("Legenda"),
  // Onde publicar (multi-select com plataforma + formato combinados)
  publicarEmField: text("publicar_em_field").notNull().default("Publicar em"),
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

// ─── Publish log ────────────────────────────────────────────────

export const publishLog = pgTable("publish_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => client.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").references(() => notionConnection.id, { onDelete: "set null" }),
  notionPageId: text("notion_page_id").notNull(),
  postTitle: text("post_title"),
  conta: text("conta"),
  platform: text("platform"),
  instagramPostId: text("instagram_post_id"),
  platformPostId: text("platform_post_id"),
  status: text("status").notNull(),
  error: text("error"),
  analyticsUpdatedAt: timestamp("analytics_updated_at"),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
})
