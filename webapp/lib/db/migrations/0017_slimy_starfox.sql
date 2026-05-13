ALTER TABLE "production" ADD COLUMN "has_vertical_media" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "production" ADD COLUMN "has_horizontal_media" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "production" ADD COLUMN "deliverable_synced_at" timestamp;