-- 0007: per-client publishing pause toggle
--
-- When TRUE, the cron skips this client entirely — publish sweep,
-- approval sweep, and analytics sync all bail at the start of
-- publishForConnection. Drives the "Publicações pausadas" banner in
-- the /clients UI. Used for paused contracts, legal disputes,
-- vacations, etc.
--
-- Default FALSE to preserve existing behavior for clients created
-- before this column existed.

ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "publishing_paused" boolean DEFAULT false NOT NULL;
