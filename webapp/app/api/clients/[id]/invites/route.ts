import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client, clientInvite, clientMember, user as userTable } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { generateId } from "@/lib/utils"
import { userIsClientOwner } from "@/lib/active-client"
import { sendInviteEmail } from "@/lib/email-notifications"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: clientId } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 })
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email) return NextResponse.json({ error: "Email obrigatório" }, { status: 400 })

  const role: "member" | "admin" = body.role === "admin" ? "admin" : "member"
  const scope: "client" | "agency" = body.scope === "agency" ? "agency" : "client"

  const isOwner = await userIsClientOwner(session.user.id, clientId)
  if (!isOwner) return NextResponse.json({ error: "Apenas owners podem convidar" }, { status: 403 })

  // Block inviting someone who's already a member of this client. Prevents
  // duplicate invites that wouldn't do anything when accepted.
  const [existingMember] = await db
    .select({ id: clientMember.id })
    .from(clientMember)
    .innerJoin(userTable, eq(userTable.id, clientMember.userId))
    .where(and(eq(clientMember.clientId, clientId), eq(userTable.email, email)))
  if (existingMember) {
    return NextResponse.json({ error: "Este email já é membro deste cliente" }, { status: 400 })
  }

  const token = generateId() + generateId().replace(/-/g, "")
  const inviteId = generateId()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.insert(clientInvite).values({
    id: inviteId,
    clientId,
    email,
    role,
    scope,
    token,
    invitedByUserId: session.user.id,
    expiresAt,
  })

  const appUrl = new URL(req.url).origin
  const inviteUrl = `${appUrl}/invites/${token}`

  // Look up client name + inviter info for the email body. Fire-and-forget;
  // even if Resend is down, the invite link is still returned and copyable.
  const [{ clientName, inviterName, inviterEmail }] = await db
    .select({
      clientName: client.name,
      inviterName: userTable.name,
      inviterEmail: userTable.email,
    })
    .from(client)
    .innerJoin(userTable, eq(userTable.id, session.user.id))
    .where(eq(client.id, clientId))

  sendInviteEmail({
    to: email,
    clientName,
    inviterName,
    inviterEmail,
    inviteUrl,
    role,
    scope,
  }).catch((e) => console.warn("[invite email] failed:", e))

  return NextResponse.json({ id: inviteId, token, inviteUrl, expiresAt })
}
