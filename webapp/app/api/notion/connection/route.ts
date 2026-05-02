import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getActiveClientId } from "@/lib/active-client"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const clientId = await getActiveClientId(session.user.id)

  const connections = await db
    .select()
    .from(notionConnection)
    .where(and(eq(notionConnection.userId, session.user.id), eq(notionConnection.clientId, clientId)))

  return NextResponse.json({ connections })
}

export async function PATCH(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { connectionId, databaseId, databaseName } = await req.json()

  await db
    .update(notionConnection)
    .set({ databaseId, databaseName, updatedAt: new Date() })
    .where(and(eq(notionConnection.id, connectionId), eq(notionConnection.userId, session.user.id)))

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { connectionId } = await req.json()

  await db
    .delete(notionConnection)
    .where(and(eq(notionConnection.id, connectionId), eq(notionConnection.userId, session.user.id)))

  return NextResponse.json({ ok: true })
}
