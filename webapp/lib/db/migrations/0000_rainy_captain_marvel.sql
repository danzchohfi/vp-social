CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_link" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"notion_page_id" text NOT NULL,
	"post_title" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"sent_via" text DEFAULT 'none' NOT NULL,
	"sent_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"decision" text,
	"decided_at" timestamp,
	"decided_from_ip" text,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "approval_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"manychat_api_key" text,
	"manychat_approval_flow_ns" text,
	"public_calendar_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_public_calendar_token_unique" UNIQUE("public_calendar_token")
);
--> statement-breakpoint
CREATE TABLE "client_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"scope" text DEFAULT 'client' NOT NULL,
	"token" text NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"accepted_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "client_member" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"scope" text DEFAULT 'client' NOT NULL,
	"invited_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_mapping" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"title_field" text DEFAULT 'Produção' NOT NULL,
	"caption_field" text DEFAULT 'Legenda' NOT NULL,
	"publicar_em_field" text DEFAULT 'Publicar em' NOT NULL,
	"hashtags_field" text,
	"tipo_field" text,
	"plataformas_field" text,
	"media_vertical_field" text DEFAULT 'Mídia Vertical' NOT NULL,
	"media_horizontal_field" text DEFAULT 'Mídia Horizontal' NOT NULL,
	"media_feed_field" text DEFAULT 'Imagens Feed' NOT NULL,
	"thumbnail_field" text DEFAULT 'Thumbnail' NOT NULL,
	"status_field" text DEFAULT 'Status' NOT NULL,
	"status_ready_value" text DEFAULT 'Agendamento' NOT NULL,
	"status_published_value" text DEFAULT 'Publicado' NOT NULL,
	"status_error_value" text DEFAULT 'Erro' NOT NULL,
	"date_field" text DEFAULT 'Dia para fazer' NOT NULL,
	"account_field" text DEFAULT 'Conta' NOT NULL,
	"likes_field" text,
	"reach_field" text,
	"comments_field" text,
	"saves_field" text,
	"impressions_field" text,
	"social_vp_field" text DEFAULT 'Social VP',
	"post_url_field" text,
	"awaiting_approval_value" text,
	"revision_requested_value" text,
	"client_contact_field" text,
	"contact_email_field" text,
	"contact_phone_field" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "field_mapping_connection_id_unique" UNIQUE("connection_id")
);
--> statement-breakpoint
CREATE TABLE "instagram_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text,
	"platform" text DEFAULT 'instagram' NOT NULL,
	"platform_account_id" text,
	"conta" text NOT NULL,
	"page_id" text NOT NULL,
	"page_name" text NOT NULL,
	"page_access_token" text NOT NULL,
	"refresh_token" text,
	"instagram_business_account_id" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notion_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text,
	"workspace_id" text NOT NULL,
	"workspace_name" text NOT NULL,
	"workspace_icon" text,
	"access_token" text NOT NULL,
	"database_id" text,
	"database_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text,
	"connection_id" text,
	"notion_page_id" text NOT NULL,
	"post_title" text NOT NULL,
	"conta" text NOT NULL,
	"platform" text,
	"instagram_post_id" text,
	"platform_post_id" text,
	"platform_post_url" text,
	"status" text NOT NULL,
	"error" text,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"metrics_last_synced_at" timestamp,
	"metrics_likes" integer,
	"metrics_comments" integer,
	"metrics_reach" integer,
	"metrics_saves" integer,
	"metrics_impressions" integer
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_link" ADD CONSTRAINT "approval_link_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_link" ADD CONSTRAINT "approval_link_connection_id_notion_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."notion_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invite" ADD CONSTRAINT "client_invite_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invite" ADD CONSTRAINT "client_invite_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_member" ADD CONSTRAINT "client_member_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_member" ADD CONSTRAINT "client_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_member" ADD CONSTRAINT "client_member_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_mapping" ADD CONSTRAINT "field_mapping_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_mapping" ADD CONSTRAINT "field_mapping_connection_id_notion_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."notion_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_account" ADD CONSTRAINT "instagram_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_account" ADD CONSTRAINT "instagram_account_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_connection" ADD CONSTRAINT "notion_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_connection" ADD CONSTRAINT "notion_connection_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_log" ADD CONSTRAINT "publish_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_log" ADD CONSTRAINT "publish_log_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_log" ADD CONSTRAINT "publish_log_connection_id_notion_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."notion_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_link_pending_per_page_uniq" ON "approval_link" USING btree ("notion_page_id") WHERE "approval_link"."decision" IS NULL;--> statement-breakpoint
CREATE INDEX "approval_link_client_idx" ON "approval_link" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "client_member_client_user_uniq" ON "client_member" USING btree ("client_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "instagram_account_user_client_platform_page_uniq" ON "instagram_account" USING btree ("user_id","client_id","platform","page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notion_connection_user_client_workspace_uniq" ON "notion_connection" USING btree ("user_id","client_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publish_log_published_dedup_uniq" ON "publish_log" USING btree ("connection_id","notion_page_id","platform") WHERE "publish_log"."status" = 'published';--> statement-breakpoint
CREATE INDEX "publish_log_client_published_idx" ON "publish_log" USING btree ("client_id","published_at");--> statement-breakpoint
CREATE INDEX "publish_log_status_idx" ON "publish_log" USING btree ("status");