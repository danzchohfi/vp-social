-- 0003: per-client mapping of Notion `conta` values
--
-- Adds an explicit text-array column on `client` so the agency can
-- declare which Notion `conta` (account-field) values belong to each
-- VP Social client. When set, /api/notion/scheduled and trigger/
-- publish.ts route posts whose conta is in this list to the matching
-- client without relying on the implicit fuzzy-match-against-
-- instagramAccount.conta heuristic. Empty = legacy name-matching.
--
-- v1: agency edits this manually in /clients/[id]/edit. v2 (future)
-- could fetch the available conta options from Notion and pre-fill.

ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "notion_conta_values" text[];
