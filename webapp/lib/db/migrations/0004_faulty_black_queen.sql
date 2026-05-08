-- 0004: reminder_sent_at column on approval_link
--
-- Used by the productionApprovalReminders cron task (trigger/publish.ts)
-- to track whether we've already sent a "lembrete" ManyChat dispatch
-- for a stale pending production-script approval. Capped at 1 reminder
-- per link by the cron's filter. NULL = no reminder sent yet.

ALTER TABLE "approval_link" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp;
