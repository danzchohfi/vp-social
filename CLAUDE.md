# CLAUDE.md

Guidance for Claude Code working in this repo. Read this before touching code.

## Working principles

These four come first. The architecture sections below exist to help you apply them.

### 1. Think Before Coding

Before any non-trivial edit:

- **Trace the data flow end-to-end.** A change to `lib/db/schema.ts` ripples into `trigger/publish.ts`, `lib/active-client.ts`, every `app/api/**/route.ts` that filters by the changed column, and any `app/(dashboard)/**/page.tsx` that reads it. Don't edit until you've followed the chain.
- **Check the multi-tenant boundary.** Every query must filter by `userId` (Better Auth) and, where applicable, `clientId` (active client / accessible client list). Forgetting either leaks rows across tenants.
- **Distinguish web vs. worker.** Anything in `trigger/` runs on Trigger.dev with `process.env.DATABASE_URL!` (no Proxy lazy init). Anything in `app/`/`lib/` runs on Vercel with the proxy `db` from `lib/db/index.ts`. Imports cross-pollinate; behavior diverges.
- **Read `lib/active-client.ts` first** when touching anything tenant-aware. The `__all__` cookie sentinel ("agency view"), `listAccessibleClients`, `getActiveClientScope`, and `userIsClientOwner` are the contract for who-can-see-what — re-deriving access logic ad-hoc is how bugs are introduced.

### 2. Simplicity First

- **No new abstractions, no new layers.** A bug fix doesn't need a refactor. Three near-identical lines beat a premature helper.
- **No backwards-compat shims, feature flags, or deprecated re-exports** — schema is pushed directly via `db:push`, there's no migration history to preserve. Rename, drop, change types — just update the call sites.
- **No defensive validation past the boundary.** Validate `req.json()` once at the route handler (`.catch(() => null)` + type check); after that, trust your own types.
- **Reuse the existing email/Resend setup** (`lib/email-notifications.ts` + the inline block in `lib/auth.ts`) — don't add another mailer.
- **Reuse `instagramAccount`** for new platforms (the `platform` column already discriminates IG, FB, YT, TikTok, LinkedIn). Don't add per-platform tables.
- **Comments only when WHY is non-obvious.** A subtle invariant, a workaround for an external API quirk, a multi-tenant fall-back rule. Never narrate WHAT the code does.

### 3. Surgical Changes

- **Change one thing at a time.** If the user asks for an invite-scope field, add the column + API + UI for that — don't also "clean up" unrelated members logic.
- **Match scope to request.** "Fix the button on iPhone" = touch the button, not the page header, not the layout.
- **Prefer `Edit` over `Write`.** Rewriting a file loses git blame and risks reverting parallel work.
- **Don't delete unfamiliar files or branches.** Investigate first — they're often the user's in-progress work or a sandboxed environment quirk.
- **Schema edits are atomic with their migration.** Edit `lib/db/schema.ts` AND run `db:push` in the same change set, or Vercel's `db:push && build` will deploy code that references columns the DB doesn't have yet. (Vercel's build command runs `db:push` first — use that.)

### 4. Goal-Driven Execution

- **Solve the user's actual problem, not the symptom.** "Posts not publishing for client X" → trace the filter pipeline (account `conta` matching → `clientId` scoping → cron filter), don't just bump a timeout.
- **Don't ship until you've checked the golden path.** For UI: `npm run dev`, click through the feature in a browser, watch the console. For cron tasks: read the new code paths against `trigger/publish.ts`'s actual control flow. Type-checks confirm code compiles, not that the feature works.
- **Stop when the goal is met.** Don't pile on "while I'm here" improvements. Every extra change is a new bug surface.
- **Confirm risky actions.** Destructive git ops, force-push, dropping columns, mass updates — surface the blast radius, get explicit OK. Local edits and reversible code changes don't need confirmation.

## Repository layout

```
webapp/             Next.js 15 SaaS application — the entire codebase
```

Everything lives in `webapp/`. Run all commands from there.

## Commands

```bash
npm run dev            # Next.js dev server with Turbopack on localhost:3000
npm run build          # Production build
npm run lint           # ESLint

npm run db:push        # Apply schema.ts changes to Neon (no migration files)
npm run db:generate    # Generate Drizzle migration files (rarely needed)
npm run db:studio      # Drizzle Studio GUI

npm run trigger:dev    # Run Trigger.dev worker locally (separate terminal)
npm run trigger:deploy # Deploy worker to Trigger.dev cloud
```

Vercel's `buildCommand` is `npm run db:push && npm run build` (see `vercel.json`), so schema changes auto-apply on deploy.

## Architecture (the actual one)

**Web request path:** Browser → Vercel (Next 15 App Router, route groups `(auth)`/`(dashboard)`/`(onboarding)`/`(public)`) → Drizzle ORM → Neon PostgreSQL (HTTP driver, lazy-initialized via Proxy in `lib/db/index.ts`).

**Auth:** Better Auth (`lib/auth.ts`) — email/password + Google + Facebook OAuth. Session cookie checked in `middleware.ts`; `auth.api.getSession({ headers: await headers() })` inside server routes/pages.

**Background jobs:** Trigger.dev worker (`trigger/`):
- `publishScheduled` — `*/5 * * * *`, fans out one `publishForConnection` per `notionConnection` with a `databaseId`.
- `syncAnalyticsScheduled` — `0 */6 * * *` America/Sao_Paulo, fans out `syncPostAnalytics` per published log < 30 days old.

**Multi-tenancy (two layers):**

1. Per-user (Better Auth `userId`) — every table has `userId`.
2. Per-client (`client` table) — `notionConnection`, `instagramAccount`, `publishLog` all carry `clientId` (nullable for legacy rows). Membership via `clientMember` (`role` ∈ `owner`/`admin`/`member`, `scope` ∈ `client`/`agency`). Active client lives in cookie `vpsocial_client_id`; the sentinel `__all__` (= `ALL_CLIENTS`) means agency view (read-only aggregation across `listAccessibleClients`).

Mutating routes MUST resolve a single client. They use `getActiveClientId` which falls back to the first accessible client when the cookie is `__all__`. UI gates with `<RequiresSingleClient>`.

## Key files

| File | Role |
|---|---|
| `lib/db/schema.ts` | Single source of truth for every table. Edit + `db:push`. |
| `lib/db/index.ts` | `db` Proxy — lazy Neon init so `next build`'s data-collection step doesn't crash without `DATABASE_URL`. |
| `lib/active-client.ts` | Tenant access contract: `listAccessibleClients`, `getActiveClient[Id]`, `getActiveClientScope`, `userIsClientOwner`, `ALL_CLIENTS` sentinel. |
| `lib/auth.ts` / `lib/auth-client.ts` | Better Auth server + client. Inline Resend block sends password resets. |
| `lib/notion.ts` | Notion API: `getReadyPosts`, `getScheduledPosts`, `markPublished`, `markFailed`, `updateAnalytics`, `setPostUrls`. |
| `lib/notion-account-sync.ts` | Pushes connected `conta` names into the Notion accountField Select options (idempotent; skips non-select types). |
| `lib/instagram.ts` | IG Graph API publishers + `getPostMetrics` for analytics + `fetchInstagramPermalink`. |
| `lib/facebook.ts` / `youtube.ts` / `tiktok.ts` / `linkedin.ts` | Per-platform publishers. |
| `lib/publisher.ts` | `publishToPlatform(platform, tipo, account, post)` dispatcher + `saveLog` writer. The router that bridges Notion fields → platform calls. |
| `lib/email-notifications.ts` | `notifyPublishFailure` (cron failures) + `sendInviteEmail`. Reuses the same Resend setup as auth — no extra dependency. |
| `trigger/publish.ts` | The publish loop. Owns Notion status flips (`markPublished`/`markFailed`) and link writeback (`setPostUrls`). |
| `trigger/analytics.ts` | Writes IG metrics back to Notion Number properties. |
| `middleware.ts` | Cookie-based auth gate; redirects to `/login` for protected paths, `/dashboard` for already-signed-in users. |

## Data model

```
user (Better Auth)
 ├── client                  (many; user is owner via client.userId)
 │    ├── clientMember       (many; role + scope per user-client pair)
 │    ├── clientInvite       (many; token-based, 7-day expiry)
 │    ├── notionConnection   (many; clientId nullable)
 │    │    └── fieldMapping  (one per connectionId)
 │    ├── instagramAccount   (many; one row per (platform, pageId))
 │    └── publishLog         (many; clientId + connectionId nullable)
 └── account/session/verification (Better Auth tables)
```

`instagramAccount` is the **shared** account table for all 5 publishing platforms — the `platform` column discriminates. The `conta` field is the human label that must match (case-insensitive) the Notion `accountField` value on a post.

## Multi-platform publish flow

1. Notion post: `statusField == statusReadyValue` AND `dateField <= now`.
2. `publishForConnection` reads the workspace's `fieldMapping` (or `DEFAULT_MAPPING`).
3. For each `target` in `post.publishTargets[]`:
   - Account lookup via `Map` keyed `"{platform}:{conta.lower()}"`. Miss → log `skipped`.
   - `publishToPlatform(target.platform, target.tipo, account, post)` returns `{id, url}`.
   - Per-platform log row written via `saveLog`.
4. After all targets: collected URLs written to `mapping.postUrlField` (single rich_text, one link per platform). Status flipped to `Publicado` if any succeeded, else `Erro`.
5. Failures fire-and-forget an email via `notifyPublishFailureAsync`.

The status flip is what removes the post from the cron filter on the next tick — without it, the same post republishes every 5 min.

## Account matching

`instagramAccount.conta` (case-insensitive) must equal the post's account-field value. For Notion **relation** properties used as the account field, `lib/notion.ts` resolves the related page's title automatically. For **Select** properties, `lib/notion-account-sync.ts` syncs option values from connected accounts so users can pick instead of typing.

## OAuth callbacks

| Platform | Auth URL → Callback |
|---|---|
| Notion | `/api/notion/auth-url` → `/api/notion/callback` (upserts `notionConnection`) |
| Facebook + Instagram | `/api/facebook/auth-url` → `/api/facebook/callback` (writes both `platform='facebook'` and `platform='instagram'` per page) |
| YouTube | `/api/youtube/auth-url` → `/api/youtube/callback` (Google OAuth, scope `youtube.upload`) |
| TikTok | `/api/tiktok/auth-url` → `/api/tiktok/callback` |
| LinkedIn | `/api/linkedin/auth-url` → `/api/linkedin/callback` |

Callbacks need a single active client. In agency mode, `getActiveClient` falls back to the first accessible client — UX surfaces `<RequiresSingleClient>` to push the user to pick one explicitly first.

**Facebook local dev:** `redirect_uri` must be URL-encoded; the Meta app must be in **Development** mode for `localhost` redirects.

## Notion specifics

- Multi-source databases (combined views) are unsupported by the Notion API — use the source DB.
- Inline databases may be invisible to Notion search — use the manual URL paste in Settings.
- The integration must be shared with **every** related database (relation properties), not just the main one.
- DB ID = the 32 hex chars in the URL `…/Title-{32hex}?v=…`.

## Analytics sync

User maps **Number** properties in Settings → workspace → Analytics. Sync writes `like_count`, `comments_count` (media object) and `reach`, `saved`, `impressions` / `plays` (insights). Stories' insights expire after 24 h — caught per-post, doesn't fail the batch.

## UI conventions

- shadcn/ui pattern, no CLI. Components in `components/ui/`. Add new ones manually following the Radix wrapper pattern of existing files.
- **Tailwind v4:** utilities like `bg-popover`, `bg-card` need their `--color-*` vars registered in the `@theme inline` block in `globals.css`. Missing → silently no-op.
- Mobile-first stacks: `flex-col gap-3 sm:flex-row` and `break-words` (not `truncate`) when text can be long.
- For tappable links on iOS Safari, prefer plain `<a>` styled as a button over `<Button asChild><a/></Button>` (the latter has missed taps in practice).

## Environment variables

Required (`.env.example` is the full list):
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`,
`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`,
`NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`,
`TRIGGER_PROJECT_ID`, `TRIGGER_SECRET_KEY`.

Optional (enable platforms / email):
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (YouTube + Google login),
`TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`,
`LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET`,
`RESEND_API_KEY`/`RESEND_FROM` (without these, emails log to console only — handy for dev).

In Vercel: Build env vars must be marked for the **Build** environment (not just Runtime), or `next build` warns about missing `BETTER_AUTH_SECRET` / `DATABASE_URL`.

## Git workflow

Default branch is `main`. Vercel auto-deploys production from `main` (verify Branch Tracking points at `main`, not a stale feature branch).

**Edits in this environment push to a local sandbox proxy, NOT GitHub directly.** To reach the user's machine:

- Use `mcp__github__push_files` / `create_or_update_file` / `delete_file` to push to GitHub `main`.
- Local `git push` can 503 (proxy upstream is flaky on `git-receive-pack`). Mitigations already applied:
  ```bash
  git config --global http.postBuffer 524288000
  git config --global http.lowSpeedLimit 1000
  git config --global http.lowSpeedTime 30
  ```
- On 503: ONE retry, then switch to MCP. Don't loop. Resync local with `git fetch origin main && git reset --hard origin/main`.
- Prune stale tracking: `git remote prune origin && git branch -D <stale>`.

Treat the stop-hook "unpushed commit" warning as a signal to switch to MCP, not to retry git.

## Known gotchas

- `npm install` may need `--legacy-peer-deps` (drizzle-kit ↔ better-auth peer dep clash).
- `db:push` locally needs envs exported: `export $(grep -v '^#' .env.local | xargs) && npm run db:push`.
- macOS Notion OAuth may hijack into the desktop app — click "Não permitir".
- Facebook app must be in **Development** mode for localhost OAuth.
- Select dropdowns: opaque-in-dark-mode requires both `bg-popover` AND `--color-popover` in `@theme inline`.
- Vercel deploys: Production vs. Preview is determined by Branch Tracking. A push to a non-tracked branch deploys to Preview only — promote manually if needed.

## Deployment

End-to-end in `webapp/DEPLOY.md`. Stack: Vercel (web) + Neon (DB) + Trigger.dev (workers). `.github/workflows/trigger-deploy.yml` redeploys the worker when files under `webapp/trigger/` or `webapp/lib/` change.
