-- 0006: per-client custom wa.me message template
--
-- The "Enviar via WA" button in /scheduled (manual approval mode)
-- builds a wa.me click-to-chat URL with a pre-filled message. Hardcoded
-- default works but agencies want to brand the message ("Olá X, a Vitamina
-- te enviou..."). This column stores the per-client override.
--
-- Placeholders: {{contact_name}}, {{post_title}}, {{approval_url}},
-- {{client_name}}. NULL = use hardcoded default.

ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "manual_whatsapp_template" text;
