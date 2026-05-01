import { db } from "@/lib/db"
import { clientInvite, client, user } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const [invite] = await db
    .select({
      id: clientInvite.id,
      clientId: clientInvite.clientId,
      email: clientInvite.email,
      role: clientInvite.role,
      acceptedAt: clientInvite.acceptedAt,
      expiresAt: clientInvite.expiresAt,
      clientName: client.name,
      clientLogoUrl: client.logoUrl,
      invitedByName: user.name,
      invitedByEmail: user.email,
    })
    .from(clientInvite)
    .innerJoin(client, eq(client.id, clientInvite.clientId))
    .innerJoin(user, eq(user.id, clientInvite.invitedByUserId))
    .where(eq(clientInvite.token, token))

  if (!invite) return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 })

  const expired = new Date(invite.expiresAt) <= new Date()
  return NextResponse.json({
    ...invite,
    expired,
    accepted: !!invite.acceptedAt,
  })
}
