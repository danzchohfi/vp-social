import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { instagramAccount } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getActiveClientId } from "@/lib/active-client"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const clientId = await getActiveClientId(userId)

  const accounts = await db
    .select()
    .from(instagramAccount)
    .where(and(eq(instagramAccount.userId, userId), eq(instagramAccount.clientId, clientId)))

  return NextResponse.json(accounts)
}
