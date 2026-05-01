import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { clientInvite, clientMember } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { generateId } from "@/lib/utils"
import { setActiveClientCookie } from "@/lib/active-client"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Faça login para aceitar o convite" }, { status: 401 })

  const { token } = await params

  const [invite] = await db
    .select()
    .from(clientInvite)
    .where(eq(clientInvite.token, token))

  if (!invite) return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 })
  if (invite.acceptedAt) return NextResponse.json({ error: "Convite já foi aceito" }, { status: 400 })
  if (new Date(invite.expiresAt) <= new Date()) {
    return NextResponse.json({ error: "Convite expirado" }, { status: 400 })
  }
  if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
    return NextResponse.json(
      { error: `Este convite é para ${invite.email}. Entre com essa conta.` },
      { status: 403 }
    )
  }

  const [existing] = await db
    .select()
    .from(clientMember)
    .where(and(eq(clientMember.clientId, invite.clientId), eq(clientMember.userId, session.user.id)))

  if (!existing) {
    await db.insert(clientMember).values({
      id: generateId(),
      clientId: invite.clientId,
      userId: session.user.id,
      role: invite.role,
      invitedByUserId: invite.invitedByUserId,
    })
  }

  await db
    .update(clientInvite)
    .set({ acceptedAt: new Date() })
    .where(eq(clientInvite.id, invite.id))

  await setActiveClientCookie(invite.clientId)

  return NextResponse.json({ ok: true, clientId: invite.clientId })
}
