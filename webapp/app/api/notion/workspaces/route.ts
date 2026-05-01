import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getActiveClientId } from "@/lib/active-client"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const clientId = await getActiveClientId(userId)

  const workspaces = await db
    .select()
    .from(notionConnection)
    .where(and(eq(notionConnection.userId, userId), eq(notionConnection.clientId, clientId)))

  return NextResponse.json(workspaces)
}
