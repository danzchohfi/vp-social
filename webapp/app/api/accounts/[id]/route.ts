import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { instagramAccount } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userHasClientAccess } from "@/lib/active-client"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const [target] = await db.select().from(instagramAccount).where(eq(instagramAccount.id, id))
  if (!target) return NextResponse.json({ error: "Não encontrada" }, { status: 404 })
  if (!target.clientId || !(await userHasClientAccess(session.user.id, target.clientId))) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 })
  }

  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (body.active !== undefined) update.active = body.active
  if (body.conta !== undefined) update.conta = body.conta

  await db.update(instagramAccount).set(update).where(eq(instagramAccount.id, id))

  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const [target] = await db.select().from(instagramAccount).where(eq(instagramAccount.id, id))
  if (!target) return NextResponse.json({ error: "Não encontrada" }, { status: 404 })
  if (!target.clientId || !(await userHasClientAccess(session.user.id, target.clientId))) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 })
  }

  await db.delete(instagramAccount).where(eq(instagramAccount.id, id))

  return NextResponse.json({ ok: true })
}
