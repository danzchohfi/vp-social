ALTER TABLE "client" ADD COLUMN "whatsapp_provider" text DEFAULT 'manychat' NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "meta_wa_token" text;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "meta_phone_number_id" text;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "meta_template_name" text;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "meta_template_language" text DEFAULT 'pt_BR' NOT NULL;