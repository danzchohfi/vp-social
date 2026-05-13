ALTER TABLE "approval_link" ADD COLUMN "tacit" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Partial index pra acelerar o tacit-approval-sweep cron (roda /15min).
-- Filtra direto os candidatos: pendentes com sentAt setado.
CREATE INDEX IF NOT EXISTS "approval_link_tacit_sweep_idx"
  ON "approval_link" ("sent_at")
  WHERE "decision" IS NULL AND "sent_at" IS NOT NULL;