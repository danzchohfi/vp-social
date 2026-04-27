# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

```
/                   Python CLI prototype (legacy, kept as reference)
  src/              notion_client.py, instagram_client.py, publisher.py
  clients/          per-client JSON credentials (legacy)
webapp/             Next.js 15 SaaS application — all active development happens here
```

All new work goes inside `webapp/`.

## Commands (run from `webapp/`)

```bash
npm run dev            # Next.js dev server with Turbopack on localhost:3000
npm run build          # Production build
npm run lint           # ESLint

npm run db:push        # Apply schema changes to Neon (no migration files, push directly)
npm run db:generate    # Generate Drizzle migration files (rarely needed)
npm run db:studio      # Drizzle Studio GUI for the database

npm run trigger:dev    # Run Trigger.dev worker locally (separate terminal)
npm run trigger:deploy # Deploy worker to Trigger.dev cloud
```

Schema changes require `db:push` to take effect. Vercel runs `db:push && build` automatically on deploy (`vercel.json` → `buildCommand`).

## Architecture

**Request path:** Browser → Vercel (Next.js API routes) → Neon (PostgreSQL via Drizzle ORM)

**Background jobs:** Trigger.dev worker polls `trigger/` directory. Two cron tasks run independently of the web server:
- `publishScheduled` (every 5 min) — fires one `publishForConnection` sub-task per `notionConnection` row that has a `databaseId`
- `syncAnalyticsScheduled` (every 6 h) — fires one `syncPostAnalytics` sub-task per published log entry from the last 30 days

**Multi-tenancy:** Every DB query filters by `userId` (from Better Auth session). `notionConnection` rows are scoped per user; `fieldMapping` rows are scoped per `connectionId` (one mapping per Notion workspace, not per user).

## Key files

| File | Role |
|---|---|
| `lib/db/schema.ts` | Single source of truth for all tables. Edit here, then `db:push`. |
| `lib/notion.ts` | Notion API client: `getReadyPosts`, `getScheduledPosts`, `markPublished`, `markFailed`, `updateAnalytics` |
| `lib/instagram.ts` | Instagram Graph API: all publish methods + `getPostMetrics` for analytics |
| `lib/auth.ts` | Better Auth config (email+password + Facebook OAuth). Server-side. |
| `lib/auth-client.ts` | Better Auth client (`useSession`, `signOut`). Client components only. |
| `trigger/publish.ts` | `publishForConnection` task — the core publish loop |
| `trigger/analytics.ts` | `syncPostAnalytics` task — writes Instagram metrics back to Notion |

## Data model (key relationships)

```
user
 ├── notionConnection   (many, unique on userId+workspaceId)
 │    └── fieldMapping  (one per connection, unique on connectionId)
 ├── instagramAccount   (many, unique on userId+pageId)
 └── publishLog         (many; connectionId nullable FK → notionConnection)
```

`fieldMapping.connectionId` links every field mapping to a specific Notion workspace. The `publishLog.connectionId` is needed by the analytics sync to find the correct Notion access token.

## Publish flow

1. Notion post has `statusField = statusReadyValue` AND `dateField ≤ now`
2. `publishForConnection` reads the matching `fieldMapping` for the workspace
3. Routes by `tipo` field → one of: `publishFeedImage`, `publishCarousel`, `publishReel`, `publishStoryImage`, `publishStoryVideo`, `publishFeedVideo`
4. On success: Notion page status → `statusPublishedValue`; `publishLog` row saved with `instagramPostId`
5. On failure: Notion page status → `statusErrorValue`; error message saved to log

## Instagram account matching

The `instagramAccount.conta` field (editable in the Accounts page) must **exactly match** (case-insensitive) the value of the `accountField` property in the Notion post. If they don't match, the post is logged as `skipped`.

## OAuth flows

- **Notion:** `/api/notion/auth-url` → Notion OAuth → `/api/notion/callback` → upsert `notionConnection`
- **Facebook/Instagram:** `/api/facebook/auth-url` → Facebook OAuth → `/api/facebook/callback` → calls `me/accounts`, resolves Instagram Business Account IDs, upserts `instagramAccount` rows

## Analytics sync

Requires the user to create **Number** properties in their Notion database and map them in Settings → workspace → Analytics section. The sync fetches:
- `like_count`, `comments_count` from the media object
- `reach`, `saved`, `impressions` (or `plays` for Reels) from `/insights`

Stories lose insight data after 24 h; errors are caught per-post without failing the whole batch.

## UI components

shadcn/ui components live in `components/ui/`. Currently present: `badge`, `button`, `card`, `input`, `label`, `select`. Add new ones by creating files there following the existing Radix UI wrapper pattern. There is no shadcn CLI configured — copy the pattern manually.

## Environment variables

See `webapp/.env.example` for the full list. Required for local dev:
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `TRIGGER_PROJECT_ID`, `TRIGGER_SECRET_KEY`

## Deployment

Full step-by-step in `webapp/DEPLOY.md`. Services used: Vercel (app), Neon (PostgreSQL), Trigger.dev (background jobs). GitHub Actions (`.github/workflows/trigger-deploy.yml`) auto-deploys the Trigger.dev worker on push when files under `webapp/trigger/` or `webapp/lib/` change.
