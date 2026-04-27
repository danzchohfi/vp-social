import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { instagramAccount } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  await db
    .update(instagramAccount)
    .set({ active: body.active, updatedAt: new Date() })
    .where(and(eq(instagramAccount.id, id), eq(instagramAccount.userId, session.user.id)))

  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  await db
    .delete(instagramAccount)
    .where(and(eq(instagramAccount.id, id), eq(instagramAccount.userId, session.user.id)))

  return NextResponse.json({ ok: true })
}
