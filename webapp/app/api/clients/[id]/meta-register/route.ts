import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { registerMetaPhone } from "@/lib/whatsapp-meta"

// One-time Cloud API onboarding for a Meta WhatsApp number. Calls
// POST /{phone_number_id}/register with the agency-chosen PIN. After
// success, /messages dispatch works. Uses the saved token + phone_id
// (no overrides from the body — registering with a wrong-token combo
// just produces noise, and "Validar" already covers credential checks).
//
// Body: { pin: string } — must be 6 digits.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const isOwner = await userIsClientOwner(session.user.id, id)
  if (!isOwner) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const body = await req.json().catch(() => null) as { pin?: unknown } | null
  const pin = typeof body?.pin === "string" ? body.pin.trim() : ""
  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json({
      ok: false,
      reason: "PIN deve ter exatamente 6 dígitos numéricos.",
    }, { status: 400 })
  }

  const [row] = await db
    .select({
      metaWaToken: client.metaWaToken,
      metaPhoneNumberId: client.metaPhoneNumberId,
    })
    .from(client)
    .where(eq(client.id, id))
  if (!row) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
  if (!row.metaWaToken || !row.metaPhoneNumberId) {
    return NextResponse.json({
      ok: false,
      reason: "Salve token + Phone Number ID em /settings antes de registrar.",
    }, { status: 400 })
  }

  const result = await registerMetaPhone(row.metaWaToken, row.metaPhoneNumberId, pin)
  return NextResponse.json(result)
}
