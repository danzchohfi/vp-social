CREATE TABLE "user_whatsapp_config" (
	"user_id" text PRIMARY KEY NOT NULL,
	"meta_wa_token" text,
	"meta_phone_number_id" text,
	"meta_template_name" text,
	"meta_template_language" text DEFAULT 'pt_BR' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_whatsapp_config" ADD CONSTRAINT "user_whatsapp_config_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "manychat_api_key";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "manychat_approval_flow_ns";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "whatsapp_provider";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "meta_wa_token";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "meta_phone_number_id";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "meta_template_name";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "meta_template_language";