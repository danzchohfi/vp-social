import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { fieldMapping } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { generateId } from "@/lib/utils"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [mapping] = await db.select().from(fieldMapping).where(eq(fieldMapping.userId, session.user.id))
  return NextResponse.json({ mapping: mapping ?? null })
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const userId = session.user.id

  const [existing] = await db.select().from(fieldMapping).where(eq(fieldMapping.userId, userId))

  if (existing) {
    await db.update(fieldMapping).set({ ...body, updatedAt: new Date() }).where(eq(fieldMapping.userId, userId))
  } else {
    await db.insert(fieldMapping).values({ id: generateId(), userId, ...body })
  }

  return NextResponse.json({ ok: true })
}
