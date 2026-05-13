import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { userWhatsappConfig } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { registerMetaPhone } from "@/lib/whatsapp-meta"

// One-time Cloud API onboarding for the agency's Meta WhatsApp number.
// POST /{phone_number_id}/register with the chosen PIN. Reads token +
// phone_id from the saved userWhatsappConfig — caller must save first.
//
// Body: { pin: string } — must be 6 digits.
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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
      metaWaToken: userWhatsappConfig.metaWaToken,
      metaPhoneNumberId: userWhatsappConfig.metaPhoneNumberId,
    })
    .from(userWhatsappConfig)
    .where(eq(userWhatsappConfig.userId, session.user.id))
  if (!row?.metaWaToken || !row?.metaPhoneNumberId) {
    return NextResponse.json({
      ok: false,
      reason: "Salve token + Phone Number ID em /settings antes de registrar.",
    }, { status: 400 })
  }

  const result = await registerMetaPhone(row.metaWaToken, row.metaPhoneNumberId, pin)
  return NextResponse.json(result)
}
