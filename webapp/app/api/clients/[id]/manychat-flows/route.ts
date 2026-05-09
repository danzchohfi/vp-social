import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { listManychatFlows } from "@/lib/manychat"

// Returns the ManyChat page's existing Flows so the approval-config UI
// can render a dropdown instead of asking the user to copy/paste the
// cryptic flow_ns string. Owner-only because we use the client's stored
// API key (or accept a candidate one in the body for pre-save preview).
//
// Body { apiKey?: string } — optional. When omitted, uses the saved
// client.manychatApiKey. Used by the panel to "preview" flows the
// user might pick BEFORE saving the API key.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const isOwner = await userIsClientOwner(session.user.id, id)
  if (!isOwner) {
    return NextResponse.json({ error: "Apenas o owner pode listar Flows" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { apiKey?: unknown }
  let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
  if (!apiKey) {
    const [row] = await db
      .select({ manychatApiKey: client.manychatApiKey })
      .from(client)
      .where(eq(client.id, id))
    apiKey = row?.manychatApiKey ?? ""
  }
  if (!apiKey) {
    return NextResponse.json({ error: "API key não configurada — cole na seção ManyChat e tente de novo" }, { status: 400 })
  }

  const result = await listManychatFlows(apiKey)
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 })
  }
  return NextResponse.json({ flows: result.flows })
}
