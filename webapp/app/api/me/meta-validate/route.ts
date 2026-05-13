import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { validateMetaCreds } from "@/lib/whatsapp-meta"

// Verifies a Meta WhatsApp Cloud token + phone_number_id pair WITHOUT
// persisting. Used by the /settings "Validar credenciais" button so
// the agency sees "✓ Token válido pra +5511… (Vitamina Publicitária)"
// before saving + before sending a real test dispatch.
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    token?: unknown
    phoneNumberId?: unknown
  } | null
  const token = typeof body?.token === "string" ? body.token.trim() : ""
  const phoneNumberId = typeof body?.phoneNumberId === "string" ? body.phoneNumberId.trim() : ""

  if (!token || !phoneNumberId) {
    return NextResponse.json({
      ok: false,
      reason: "token e phone_number_id obrigatórios",
    }, { status: 400 })
  }

  const result = await validateMetaCreds(token, phoneNumberId)
  return NextResponse.json(result)
}
