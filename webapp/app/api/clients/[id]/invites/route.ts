import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { clientInvite } from "@/lib/db/schema"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { generateId } from "@/lib/utils"
import { userIsClientOwner } from "@/lib/active-client"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: clientId } = await params
  const { email, role } = await req.json()
  if (!email?.trim()) return NextResponse.json({ error: "Email obrigatório" }, { status: 400 })

  const isOwner = await userIsClientOwner(session.user.id, clientId)
  if (!isOwner) return NextResponse.json({ error: "Apenas owners podem convidar" }, { status: 403 })

  const token = generateId() + generateId().replace(/-/g, "")
  const inviteId = generateId()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.insert(clientInvite).values({
    id: inviteId,
    clientId,
    email: email.trim().toLowerCase(),
    role: role === "admin" ? "admin" : "member",
    token,
    invitedByUserId: session.user.id,
    expiresAt,
  })

  const appUrl = new URL(req.url).origin
  const inviteUrl = `${appUrl}/invites/${token}`

  return NextResponse.json({ id: inviteId, token, inviteUrl, expiresAt })
}
