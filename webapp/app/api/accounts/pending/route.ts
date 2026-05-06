import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { instagramAccount } from "@/lib/db/schema"
import { and, eq, gte, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getActiveClientId } from "@/lib/active-client"
import { syncAccountsToNotionAsync } from "@/lib/notion-account-sync"

// "Pending" accounts are the ones the Facebook OAuth callback just inserted
// (active=false) within the last PENDING_WINDOW_MINUTES. After that window
// they're no longer treated as "needs confirmation" and just appear as a
// regular inactive account in /accounts (which the user can manually
// activate or delete).
const PENDING_WINDOW_MINUTES = 30

function pendingCutoff(): Date {
  return new Date(Date.now() - PENDING_WINDOW_MINUTES * 60 * 1000)
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const clientId = await getActiveClientId(session.user.id)

  const pending = await db
    .select()
    .from(instagramAccount)
    .where(and(
      eq(instagramAccount.userId, session.user.id),
      eq(instagramAccount.clientId, clientId),
      eq(instagramAccount.active, false),
      gte(instagramAccount.createdAt, pendingCutoff()),
    ))

  return NextResponse.json({ accounts: pending })
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const clientId = await getActiveClientId(session.user.id)
  const body = await req.json().catch(() => ({}))
  const keep: string[] = Array.isArray(body.keep) ? body.keep : []

  // Snapshot the pending set first so we know exactly which IDs are in
  // play — `keep` is only honored if the ID is currently pending for this
  // client, preventing a stale or malicious request from activating a
  // long-disabled account.
  const pending = await db
    .select()
    .from(instagramAccount)
    .where(and(
      eq(instagramAccount.userId, session.user.id),
      eq(instagramAccount.clientId, clientId),
      eq(instagramAccount.active, false),
      gte(instagramAccount.createdAt, pendingCutoff()),
    ))

  const pendingIds = new Set(pending.map((a) => a.id))
  const toKeep = keep.filter((id) => pendingIds.has(id))
  const toDelete = pending.filter((a) => !toKeep.includes(a.id)).map((a) => a.id)

  if (toKeep.length > 0) {
    await db
      .update(instagramAccount)
      .set({ active: true, updatedAt: new Date() })
      .where(inArray(instagramAccount.id, toKeep))
  }

  if (toDelete.length > 0) {
    await db
      .delete(instagramAccount)
      .where(inArray(instagramAccount.id, toDelete))
  }

  // Push the now-active contas to the Notion Select options so the user
  // can pick them in the database without typing.
  if (toKeep.length > 0 || toDelete.length > 0) {
    syncAccountsToNotionAsync(clientId)
  }

  return NextResponse.json({ activated: toKeep.length, deleted: toDelete.length })
}
