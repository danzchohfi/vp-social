ALTER TABLE "field_mapping" ADD COLUMN "production_status_field" text DEFAULT 'Status (Produção)';--> statement-breakpoint
ALTER TABLE "production" ADD COLUMN "notion_status" text;--> statement-breakpoint
ALTER TABLE "production" ADD COLUMN "notion_status_synced_at" timestamp;