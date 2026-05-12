import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { instagramAccount, notionConnection } from "@/lib/db/schema"
import { inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getAccessibleClientIds, isAgencyMode, getActiveClientId } from "@/lib/active-client"

// Token-staleness probe. The dashboard banner calls this on mount to ask
// "do I have any platform connections that look broken?" We don't fire
// validation requests against IG/FB/YT/etc. — that's expensive and would
// hit rate limits if every page-load did it. Instead we trust two signals
// already in the DB:
//
//   1. `lastRefreshError` set on instagramAccount — set whenever a publish
//      attempt got 401/403 from the platform. Means we KNOW the token's
//      broken; user needs to reconnect.
//   2. `updatedAt` older than STALE_DAYS — heuristic for "token hasn't been
//      touched in a while". Refresh tokens for OAuth platforms typically
//      stop working after long inactivity. Not a hard failure but worth
//      warning about.
//
// Returns: { stale: [{ kind, platform, accountName, accountId, since, reason }] }
//   kind = 'instagram' | 'notion'   (notion uses workspace_name, no refresh error column yet)
//   reason = 'refresh_failed' | 'stale'  — UI surfaces different copy

const STALE_DAYS = 60
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000

type StaleItem = {
  kind: "instagram" | "notion"
  platform: string
  accountName: string
  accountId: string
  since: string
  reason: "refresh_failed" | "stale"
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  // Scope: agency mode → check across all accessible clients. Single-client
  // mode → only that client. Avoids spamming the user with "reconnect
  // YouTube" warnings for clients they're not currently working on.
  const agency = await isAgencyMode()
  const clientIds = agency
    ? await getAccessibleClientIds(userId)
    : [await getActiveClientId(userId)]

  if (clientIds.length === 0) {
    return NextResponse.json({ stale: [] })
  }

  const [igRows, notionRows] = await Promise.all([
    db
      .select({
        id: instagramAccount.id,
        platform: instagramAccount.platform,
        conta: instagramAccount.conta,
        pageName: instagramAccount.pageName,
        active: instagramAccount.active,
        updatedAt: instagramAccount.updatedAt,
        lastRefreshError: instagramAccount.lastRefreshError,
        lastRefreshErrorAt: instagramAccount.lastRefreshErrorAt,
      })
      .from(instagramAccount)
      .where(inArray(instagramAccount.clientId, clientIds)),
    db
      .select({
        id: notionConnection.id,
        workspaceName: notionConnection.workspaceName,
        databaseId: notionConnection.databaseId,
        updatedAt: notionConnection.updatedAt,
      })
      .from(notionConnection)
      .where(inArray(notionConnection.clientId, clientIds)),
  ])

  const now = Date.now()
  const stale: StaleItem[] = []

  for (const row of igRows) {
    if (!row.active) continue
    if (row.lastRefreshError) {
      stale.push({
        kind: "instagram",
        platform: row.platform,
        accountName: row.conta || row.pageName,
        accountId: row.id,
        since: (row.lastRefreshErrorAt ?? row.updatedAt).toISOString(),
        reason: "refresh_failed",
      })
      continue
    }
    if (now - row.updatedAt.getTime() > STALE_MS) {
      stale.push({
        kind: "instagram",
        platform: row.platform,
        accountName: row.conta || row.pageName,
        accountId: row.id,
        since: row.updatedAt.toISOString(),
        reason: "stale",
      })
    }
  }

  // Notion connections only fire the stale heuristic — Notion tokens are
  // long-lived and we don't yet track refresh failures on them.
  for (const row of notionRows) {
    if (!row.databaseId) continue
    if (now - row.updatedAt.getTime() > STALE_MS) {
      stale.push({
        kind: "notion",
        platform: "notion",
        accountName: row.workspaceName,
        accountId: row.id,
        since: row.updatedAt.toISOString(),
        reason: "stale",
      })
    }
  }

  return NextResponse.json({ stale })
}
