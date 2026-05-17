ALTER TABLE "approval_link" DROP CONSTRAINT "approval_link_connection_id_notion_connection_id_fk";
--> statement-breakpoint
ALTER TABLE "approval_link" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_link" ADD CONSTRAINT "approval_link_connection_id_notion_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."notion_connection"("id") ON DELETE set null ON UPDATE no action;