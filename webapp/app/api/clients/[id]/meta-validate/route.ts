import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { validateMetaCreds } from "@/lib/whatsapp-meta"

// Verifies a Meta WhatsApp Cloud token + phone_number_id pair WITHOUT
// persisting. Used by the /settings "Validar credenciais" button so
// the agency sees "✓ Token válido pra +5511… (Vitamina Publicitária)"
// before saving + before sending a real test dispatch.
//
// Body: { token: string, phoneNumberId: string }
// We don't auto-read from the saved row — the agency might be
// editing unsaved values.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const ok = await userIsClientOwner(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

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
