import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim()
  if (body.logoUrl !== undefined) update.logoUrl = body.logoUrl

  await db
    .update(client)
    .set(update)
    .where(and(eq(client.id, id), eq(client.userId, session.user.id)))

  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const all = await db.select().from(client).where(eq(client.userId, session.user.id))
  if (all.length <= 1) {
    return NextResponse.json(
      { error: "Você precisa manter pelo menos um cliente." },
      { status: 400 }
    )
  }

  await db
    .delete(client)
    .where(and(eq(client.id, id), eq(client.userId, session.user.id)))

  return NextResponse.json({ ok: true })
}
