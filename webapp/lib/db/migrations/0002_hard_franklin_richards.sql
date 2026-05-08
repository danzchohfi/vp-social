CREATE TABLE "approver" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text DEFAULT 'client' NOT NULL,
	"magic_token" text NOT NULL,
	"magic_token_issued_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "approver_magic_token_unique" UNIQUE("magic_token")
);
--> statement-breakpoint
CREATE TABLE "production" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text DEFAULT 'video' NOT NULL,
	"title" text NOT NULL,
	"topic" text,
	"specialist_name" text,
	"specialist_contact_name" text,
	"specialist_contact_email" text,
	"specialist_contact_phone" text,
	"brief_json" text,
	"script_json" text,
	"status" text DEFAULT 'script_drafting' NOT NULL,
	"recording_date" timestamp,
	"delivery_date" timestamp,
	"publish_date" timestamp,
	"final_video_url" text,
	"notion_page_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_approver" (
	"production_id" text NOT NULL,
	"approver_id" text NOT NULL,
	"step_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"production_id" text NOT NULL,
	"author_user_id" text,
	"author_name" text,
	"body" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "approval_link_pending_per_page_uniq";--> statement-breakpoint
ALTER TABLE "approval_link" ADD COLUMN "kind" text DEFAULT 'post' NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_link" ADD COLUMN "production_id" text;--> statement-breakpoint
ALTER TABLE "approval_link" ADD COLUMN "approver_id" text;--> statement-breakpoint
ALTER TABLE "approval_link" ADD COLUMN "round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "approver" ADD CONSTRAINT "approver_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production" ADD CONSTRAINT "production_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production" ADD CONSTRAINT "production_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_approver" ADD CONSTRAINT "production_approver_production_id_production_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."production"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_approver" ADD CONSTRAINT "production_approver_approver_id_approver_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."approver"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_comment" ADD CONSTRAINT "production_comment_production_id_production_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."production"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_comment" ADD CONSTRAINT "production_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approver_user_idx" ON "approver" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "production_client_idx" ON "production" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "production_client_status_idx" ON "production" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "production_approver_pk" ON "production_approver" USING btree ("production_id","approver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_approver_step_uniq" ON "production_approver" USING btree ("production_id","step_order");--> statement-breakpoint
CREATE INDEX "production_comment_production_idx" ON "production_comment" USING btree ("production_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_link_pending_post_uniq" ON "approval_link" USING btree ("notion_page_id") WHERE "approval_link"."decision" IS NULL AND "approval_link"."kind" = 'post';--> statement-breakpoint
CREATE UNIQUE INDEX "approval_link_pending_production_uniq" ON "approval_link" USING btree ("production_id","approver_id","round") WHERE "approval_link"."decision" IS NULL AND "approval_link"."kind" = 'production_script' AND "approval_link"."production_id" IS NOT NULL;