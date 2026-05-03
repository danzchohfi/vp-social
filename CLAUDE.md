# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

```
webapp/             Next.js 15 SaaS application — the entire codebase
```

All code lives in `webapp/`. The repo previously had a Python CLI prototype at the root (`main.py`, `src/`, `clients/`) — it was deleted in commit 74d18b1's neighborhood once the webapp reached feature parity.

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

## Git workflow

Default branch is `main`. Vercel deploys production from `main` automatically.

**IMPORTANT:** Edits made by Claude Code in this environment push to a local git server, NOT directly to GitHub. To sync changes to the user's machine:
- Use `mcp__github__push_files` (or `create_or_update_file` / `delete_file`) to push directly to GitHub `main`
- The user then runs `git pull origin main` on their Mac
- Never rely on local `git push` alone — it won't reach GitHub

**Local `git push` can fail with HTTP 503.** The local proxy at `127.0.0.1:<port>/git/...` is sandbox infrastructure — its upstream link to GitHub is sometimes flaky on `git-receive-pack`, even when fetch works fine. The proxy itself is not under the agent's control; only mitigations are possible.

Mitigations already applied to this environment (idempotent — safe to re-run):
```bash
git config --global http.postBuffer 524288000   # 500MB buffer, avoids chunked transfer
git config --global http.lowSpeedLimit 1000     # 1KB/s floor
git config --global http.lowSpeedTime 30        # abort after 30s under floor (faster retry)
```

When `git push` still fails with 503:
- Try ONE retry. If it fails again, switch to MCP — don't loop on git push, the proxy may stay flaky for minutes.
- Push files via `mcp__github__create_or_update_file` / `push_files` / `delete_file` directly to GitHub.
- Resync local: `git fetch origin main && git reset --hard origin/main` so subsequent `git status` is clean.
- Treat the stop hook's "unpushed commit" warning as a signal to switch to MCP, not to keep retrying git.

If a local branch was also deleted upstream, prune it: `git remote prune origin && git branch -D <stale>`.

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
| `lib/notion.ts` | Notion API client: `getReadyPosts`, `getScheduledPosts`, `markPublished`, `markFailed`, `updateAnalytics`, `setPostUrls` (multi-platform link writeback) |
| `lib/instagram.ts` | Instagram Graph API: all publish methods + `fetchInstagramPermalink` + `getPostMetrics` for analytics |
| `lib/facebook.ts` | Facebook Pages publisher: `publishSingleImage`, `publishCarousel`, `publishVideo` |
| `lib/youtube.ts` | YouTube Data API v3 upload with token refresh |
| `lib/tiktok.ts` | TikTok Content Posting API v2 with token refresh |
| `lib/linkedin.ts` | LinkedIn UGC Posts with image upload and token refresh |
| `lib/auth.ts` | Better Auth config (email+password + Google + Facebook OAuth). Server-side. |
| `lib/auth-client.ts` | Better Auth client (`useSession`, `signOut`). Client components only. |
| `trigger/publish.ts` | `publishForConnection` task — the core multi-platform publish loop. Calls `markPublished`/`markFailed` after each post + `setPostUrls` to write public links back. |
| `trigger/analytics.ts` | `syncPostAnalytics` task — writes Instagram metrics back to Notion |

## Data model (key relationships)

```
user
 ├── notionConnection   (many, unique on userId+workspaceId)
 │    └── fieldMapping  (one per connection, unique on connectionId)
 ├── instagramAccount   (many, unique on userId+platform+pageId)
 └── publishLog         (many; connectionId nullable FK → notionConnection)
```

`instagramAccount` table is used for ALL platforms (instagram, facebook, youtube, tiktok, linkedin) — the `platform` column differentiates them. The `conta` field must match the Notion account field value.

## Multi-platform publish flow

1. Notion post has `statusField = statusReadyValue` AND `dateField ≤ now`
2. `publishForConnection` reads the matching `fieldMapping` for the workspace
3. For each platform in `post.plataformas[]`:
   - Looks up account via Map key `"{platform}:{conta}"` (case-insensitive)
   - Routes by `tipo` field to the appropriate publisher lib
   - Collects the returned `{id, url}` into a per-post array
4. After all platforms attempted: write the collected URLs to `mapping.postUrlField` as a rich_text block (one clickable link per platform)
5. On success: Notion page status → `statusPublishedValue`; `publishLog` row saved with `platformPostUrl`
6. On failure: Notion page status → `statusErrorValue`; error message saved to log

## Account matching

The `instagramAccount.conta` field (editable in the Accounts page) must **exactly match** (case-insensitive) the value of the `accountField` property in the Notion post. Map key format: `"platform:conta"`. If no match, the post is logged as `skipped` for that platform.

For Notion **relation** fields used as the account field: `lib/notion.ts` automatically fetches the title of the first related page to use as the account name.

## OAuth flows

- **Notion:** `/api/notion/auth-url` → Notion OAuth → `/api/notion/callback` → upsert `notionConnection`
- **Facebook/Instagram:** `/api/facebook/auth-url` → Facebook OAuth → `/api/facebook/callback` → saves rows for both `platform='instagram'` AND `platform='facebook'` per page
- **YouTube:** `/api/youtube/auth-url` → Google OAuth (scope: youtube.upload) → `/api/youtube/callback`
- **TikTok:** `/api/tiktok/auth-url` → `/api/tiktok/callback` (requires `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET`)
- **LinkedIn:** `/api/linkedin/auth-url` → `/api/linkedin/callback` (requires `LINKEDIN_CLIENT_ID` + `LINKEDIN_CLIENT_SECRET`)

**Facebook OAuth local dev:** `http://localhost` redirects are automatically allowed in Meta development mode. The app must be in **Development** mode (not Live) for localhost to work. `redirect_uri` must be URL-encoded in the auth URL.

## Notion database notes

- Databases with **multiple data sources** (combined views) are NOT supported by the Notion API — use the source database directly
- **Inline databases** may not appear in the Notion search API — use the manual URL input in Settings to paste the database URL directly
- The integration must be shared with ALL databases referenced by relation fields, not just the main database
- The database URL format: `https://notion.so/workspace/Title-{32hexchars}?v=...` — the 32-char hex is the database ID

## Analytics sync

Requires the user to create **Number** properties in their Notion database and map them in Settings → workspace → Analytics section. The sync fetches:
- `like_count`, `comments_count` from the media object
- `reach`, `saved`, `impressions` (or `plays` for Reels) from `/insights`

Stories lose insight data after 24 h; errors are caught per-post without failing the whole batch.

## UI components

shadcn/ui components live in `components/ui/`. Currently present: `badge`, `button`, `card`, `input`, `label`, `select`. Add new ones by creating files there following the existing Radix UI wrapper pattern. There is no shadcn CLI configured — copy the pattern manually.

**Tailwind v4 note:** CSS utility classes like `bg-popover`, `bg-card`, etc. require the corresponding `--color-*` variable to be registered in the `@theme inline` block in `globals.css`. Missing registrations cause the utility to silently have no effect.

## Environment variables

See `webapp/.env.example` for the full list. Required for local dev:
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `TRIGGER_PROJECT_ID`, `TRIGGER_SECRET_KEY`

Optional (enable additional platforms):
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (YouTube + Google login), `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`

## Deployment

Full step-by-step in `webapp/DEPLOY.md`. Services used: Vercel (app), Neon (PostgreSQL), Trigger.dev (background jobs). GitHub Actions (`.github/workflows/trigger-deploy.yml`) auto-deploys the Trigger.dev worker on push when files under `webapp/trigger/` or `webapp/lib/` change.

## Known issues / gotchas

- `npm install` may need `--legacy-peer-deps` due to `drizzle-kit` / `better-auth` peer dep conflict
- `db:push` needs env vars exported: `export $(grep -v '^#' .env.local | xargs) && npm run db:push`
- Mac: Notion OAuth may open the desktop app — click "Não permitir" when prompted
- Facebook app must be in **Development** mode for localhost OAuth to work
- Select dropdown items need `bg-popover` AND `--color-popover` registered in `@theme inline` to be opaque in dark mode
