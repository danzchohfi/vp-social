import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { diagnoseMeta } from "@/lib/whatsapp-meta"

// Deep diagnostic for Meta WhatsApp Cloud credentials. Introspects the
// token (debug_token) AND the phone_number_id → WABA mapping, then
// cross-references. Surfaces the classic "phone belongs to a WABA the
// token can't act on" trap (Meta test number gotcha) that surfaces at
// send time as opaque code 200.
//
// Body: { token?: string, phoneNumberId?: string }
// If either is omitted, reads from the saved client row. That lets the
// agency diagnose either unsaved edits OR the currently-active config
// without re-pasting secrets.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const isOwner = await userIsClientOwner(session.user.id, id)
  if (!isOwner) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    token?: unknown
    phoneNumberId?: unknown
  } | null
  let token = typeof body?.token === "string" ? body.token.trim() : ""
  let phoneNumberId = typeof body?.phoneNumberId === "string" ? body.phoneNumberId.trim() : ""

  if (!token || !phoneNumberId) {
    const [row] = await db
      .select({
        metaWaToken: client.metaWaToken,
        metaPhoneNumberId: client.metaPhoneNumberId,
      })
      .from(client)
      .where(eq(client.id, id))
    if (!row) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
    if (!token) token = row.metaWaToken ?? ""
    if (!phoneNumberId) phoneNumberId = row.metaPhoneNumberId ?? ""
  }

  if (!token || !phoneNumberId) {
    return NextResponse.json({
      ok: false,
      summary: "Salve token + Phone Number ID em /settings antes de diagnosticar.",
    }, { status: 400 })
  }

  const diagnosis = await diagnoseMeta(token, phoneNumberId)
  return NextResponse.json(diagnosis)
}
