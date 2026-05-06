import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { validateManychatToken } from "@/lib/manychat"

// POST /api/clients/[id]/manychat-validate
//
// Body: { apiKey?: string } — if omitted, uses the saved client.manychatApiKey.
// Returns: { ok: true, page: {...} } | { ok: false, reason: "..." }
//
// Lets the agency confirm "this token works for X page" before saving,
// or re-validate the saved token when something fails. Owner-only.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const isOwner = await userIsClientOwner(session.user.id, id)
  if (!isOwner) {
    return NextResponse.json({ error: "Apenas o owner pode validar a conexão" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  let apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : ""

  if (!apiKey) {
    const [row] = await db
      .select({ manychatApiKey: client.manychatApiKey })
      .from(client)
      .where(eq(client.id, id))
    apiKey = row?.manychatApiKey ?? ""
  }

  if (!apiKey) {
    return NextResponse.json({ ok: false, reason: "Sem API key salvo nem enviado" }, { status: 400 })
  }

  const result = await validateManychatToken(apiKey)
  return NextResponse.json(result)
}
