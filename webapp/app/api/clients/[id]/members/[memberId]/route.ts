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
