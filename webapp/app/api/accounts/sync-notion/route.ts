import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getActiveClientId } from "@/lib/active-client"
import { syncAccountsToNotion } from "@/lib/notion-account-sync"

// Manual trigger for "Sincronizar com Notion" button in /accounts. Same
// helper that fires automatically on account mutations, but here we want
// the result back so the UI can show success/skip per workspace.
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const clientId = await getActiveClientId(userId)

  const results = await syncAccountsToNotion(userId, clientId)

  return NextResponse.json({ results })
}
