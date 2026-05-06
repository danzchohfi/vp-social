import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { clientMember } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: clientId, memberId } = await params

  const isOwner = await userIsClientOwner(session.user.id, clientId)
  if (!isOwner) return NextResponse.json({ error: "Apenas owners podem remover membros" }, { status: 403 })

  const [target] = await db
    .select()
    .from(clientMember)
    .where(and(eq(clientMember.id, memberId), eq(clientMember.clientId, clientId)))

  if (!target) return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 })

  if (target.role === "owner") {
    return NextResponse.json({ error: "Não é possível remover o owner" }, { status: 400 })
  }

  await db.delete(clientMember).where(eq(clientMember.id, memberId))

  return NextResponse.json({ ok: true })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: clientId, memberId } = await params

  const isOwner = await userIsClientOwner(session.user.id, clientId)
  if (!isOwner) return NextResponse.json({ error: "Apenas owners podem alterar papéis" }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 })
  }

  const [target] = await db
    .select()
    .from(clientMember)
    .where(and(eq(clientMember.id, memberId), eq(clientMember.clientId, clientId)))

  if (!target) return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 })
  if (target.role === "owner") {
    return NextResponse.json({ error: "Não é possível alterar o owner" }, { status: 400 })
  }

  const updates: { role?: "member" | "admin"; scope?: "client" | "agency" } = {}
  if (body.role === "member" || body.role === "admin") updates.role = body.role
  if (body.scope === "client" || body.scope === "agency") updates.scope = body.scope

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 })
  }

  await db.update(clientMember).set(updates).where(eq(clientMember.id, memberId))

  return NextResponse.json({ ok: true })
}
