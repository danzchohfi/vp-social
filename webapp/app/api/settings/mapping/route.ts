import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { fieldMapping } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { generateId } from "@/lib/utils"

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const connectionId = new URL(req.url).searchParams.get("connectionId")
  if (!connectionId) return NextResponse.json({ error: "connectionId required" }, { status: 400 })

  const [mapping] = await db
    .select()
    .from(fieldMapping)
    .where(and(eq(fieldMapping.connectionId, connectionId), eq(fieldMapping.userId, session.user.id)))

  return NextResponse.json({ mapping: mapping ?? null })
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { connectionId, ...fields } = await req.json()
  if (!connectionId) return NextResponse.json({ error: "connectionId required" }, { status: 400 })

  const userId = session.user.id

  const [existing] = await db
    .select()
    .from(fieldMapping)
    .where(and(eq(fieldMapping.connectionId, connectionId), eq(fieldMapping.userId, userId)))

  if (existing) {
    await db
      .update(fieldMapping)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(fieldMapping.id, existing.id))
  } else {
    await db.insert(fieldMapping).values({ id: generateId(), userId, connectionId, ...fields })
  }

  return NextResponse.json({ ok: true })
}
