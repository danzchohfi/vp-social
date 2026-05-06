import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { clientInvite, clientMember } from "@/lib/db/schema"
import { and, eq, isNull } from "drizzle-orm"
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

  // Two operations, each idempotent on its own — neon-http doesn't support
  // interactive transactions, so we sequence the writes such that any retry
  // (concurrent tab, crash between calls) converges to the same state:
  //
  //   1) INSERT membership ON CONFLICT DO NOTHING — concurrent accepts by
  //      the same user no-op the second insert thanks to the unique index
  //      on (clientId, userId).
  //   2) UPDATE invite acceptedAt WHERE acceptedAt IS NULL — the WHERE
  //      clause makes this atomic at row level: the second concurrent call
  //      finds no matching row and no-ops. If a crash happens between (1)
  //      and (2), the user already has membership; the next retry will
  //      flip acceptedAt — no stuck state.
  await db
    .insert(clientMember)
    .values({
      id: generateId(),
      clientId: invite.clientId,
      userId: session.user.id,
      role: invite.role,
      // Carry the invite scope through. Without this, "agency" invites
      // silently degrade to "client" scope on accept.
      scope: invite.scope,
      invitedByUserId: invite.invitedByUserId,
    })
    .onConflictDoNothing({
      target: [clientMember.clientId, clientMember.userId],
    })

  await db
    .update(clientInvite)
    .set({ acceptedAt: new Date() })
    .where(and(
      eq(clientInvite.id, invite.id),
      isNull(clientInvite.acceptedAt),
    ))

  await setActiveClientCookie(invite.clientId)

  return NextResponse.json({ ok: true, clientId: invite.clientId })
}
