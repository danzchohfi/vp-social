import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { clientMember, clientInvite, user } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userHasClientAccess, userIsClientOwner } from "@/lib/active-client"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: clientId } = await params

  const ok = await userHasClientAccess(session.user.id, clientId)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const members = await db
    .select({
      id: clientMember.id,
      userId: clientMember.userId,
      role: clientMember.role,
      scope: clientMember.scope,
      createdAt: clientMember.createdAt,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
    })
    .from(clientMember)
    .innerJoin(user, eq(user.id, clientMember.userId))
    .where(eq(clientMember.clientId, clientId))

  // Pending invites are owner-only: the row contains the invite token,
  // which is the secret credential used at /invites/{token} to accept the
  // membership. Returning it to a regular member would let them lift any
  // pending invite link out of the response and accept it (the email-match
  // check on accept would block reuse by other addresses, but we still
  // shouldn't expose the token at all). The invite UI in /clients also
  // gates rendering on canManage, so non-owners don't even need this data.
  const isOwner = await userIsClientOwner(session.user.id, clientId)
  if (!isOwner) {
    return NextResponse.json({ members, invites: [] })
  }

  const invites = await db
    .select({
      id: clientInvite.id,
      email: clientInvite.email,
      role: clientInvite.role,
      scope: clientInvite.scope,
      token: clientInvite.token,
      expiresAt: clientInvite.expiresAt,
      acceptedAt: clientInvite.acceptedAt,
    })
    .from(clientInvite)
    .where(eq(clientInvite.clientId, clientId))

  const pending = invites.filter((i) => !i.acceptedAt && new Date(i.expiresAt) > new Date())

  return NextResponse.json({ members, invites: pending })
}
