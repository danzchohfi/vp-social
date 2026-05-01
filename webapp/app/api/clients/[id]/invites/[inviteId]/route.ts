import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { clientInvite } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: clientId, inviteId } = await params

  const isOwner = await userIsClientOwner(session.user.id, clientId)
  if (!isOwner) return NextResponse.json({ error: "Apenas owners podem revogar convites" }, { status: 403 })

  await db
    .delete(clientInvite)
    .where(and(eq(clientInvite.id, inviteId), eq(clientInvite.clientId, clientId)))

  return NextResponse.json({ ok: true })
}
