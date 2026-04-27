import { pgTable, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core"

// ─── Better Auth tables ────────────────────────────────────────────────────

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

// ─── Notion connections ────────────────────────────────────────────────────

export const notionConnection = pgTable(
  "notion_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token").notNull(),
    workspaceId: text("workspace_id").notNull(),
    workspaceName: text("workspace_name").notNull(),
    workspaceIcon: text("workspace_icon"),
    databaseId: text("database_id"),
    databaseName: text("database_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notion_connection_user_workspace").on(t.userId, t.workspaceId)]
)

// ─── Instagram / Facebook accounts ────────────────────────────────────────

export const instagramAccount = pgTable(
  "instagram_account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    conta: text("conta").notNull(),
    pageName: text("page_name").notNull(),
    pageId: text("page_id").notNull(),
    instagramBusinessAccountId: text("instagram_business_account_id").notNull(),
    pageAccessToken: text("page_access_token").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("instagram_account_user_page").on(t.userId, t.pageId)]
)

// ─── Field mapping ─────────────────────────────────────────────────────────

export const fieldMapping = pgTable("field_mapping", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().references(() => notionConnection.id, { onDelete: "cascade" }).unique(),
  // Campos de identificação
  titleField: text("title_field").notNull().default("Produção"),
  captionField: text("caption_field").notNull().default("Legenda"),
  hashtagsField: text("hashtags_field").notNull().default("Hashtags"),
  // Tipo de conteúdo e plataformas
  tipoField: text("tipo_field").notNull().default("Tipo"),
  plataformasField: text("plataformas_field").notNull().default("Plataformas"),
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

// ─── Publish log ───────────────────────────────────────────────────────────

export const publishLog = pgTable("publish_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").references(() => notionConnection.id, { onDelete: "set null" }),
  notionPageId: text("notion_page_id").notNull(),
  postTitle: text("post_title"),
  conta: text("conta"),
  instagramPostId: text("instagram_post_id"),
  status: text("status").notNull(),
  error: text("error"),
  analyticsUpdatedAt: timestamp("analytics_updated_at"),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
})
