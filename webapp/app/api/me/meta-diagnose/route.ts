import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { userWhatsappConfig } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { diagnoseMeta } from "@/lib/whatsapp-meta"

// Deep diagnostic for Meta WhatsApp Cloud credentials. Introspects the
// token (debug_token) AND the phone_number_id → WABA mapping, then
// cross-references. Surfaces the classic "phone belongs to a WABA the
// token can't act on" trap (Meta test number gotcha).
//
// Body: { token?: string, phoneNumberId?: string }
// If either is omitted, reads from the saved userWhatsappConfig.
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    token?: unknown
    phoneNumberId?: unknown
  } | null
  let token = typeof body?.token === "string" ? body.token.trim() : ""
  let phoneNumberId = typeof body?.phoneNumberId === "string" ? body.phoneNumberId.trim() : ""

  if (!token || !phoneNumberId) {
    const [row] = await db
      .select({
        metaWaToken: userWhatsappConfig.metaWaToken,
        metaPhoneNumberId: userWhatsappConfig.metaPhoneNumberId,
      })
      .from(userWhatsappConfig)
      .where(eq(userWhatsappConfig.userId, session.user.id))
    if (!token) token = row?.metaWaToken ?? ""
    if (!phoneNumberId) phoneNumberId = row?.metaPhoneNumberId ?? ""
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
