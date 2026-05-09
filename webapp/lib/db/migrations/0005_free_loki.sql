-- 0005: per-client approval notification mode
--
-- Lets the agency declare HOW they want clients to receive approval
-- notifications: automated via ManyChat API, or manually via wa.me
-- click-to-chat. Drives:
--   - the cron's dispatch decision in trigger/publish.ts
--   - the "configurada / parcial / não configurada" status pill in /clients
--   - which inputs are visible in the ApprovalPanel form
--
-- Values: 'auto_manychat' | 'manual_whatsapp' | NULL (legacy = auto_manychat).

ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "approval_notification_mode" text;
