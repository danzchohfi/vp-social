import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { clientMember, clientInvite, user } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userHasClientAccess } from "@/lib/active-client"

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
      createdAt: clientMember.createdAt,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
    })
    .from(clientMember)
    .innerJoin(user, eq(user.id, clientMember.userId))
    .where(eq(clientMember.clientId, clientId))

  const invites = await db
    .select()
    .from(clientInvite)
    .where(and(eq(clientInvite.clientId, clientId)))

  const pending = invites.filter((i) => !i.acceptedAt && new Date(i.expiresAt) > new Date())

  return NextResponse.json({ members, invites: pending })
}
