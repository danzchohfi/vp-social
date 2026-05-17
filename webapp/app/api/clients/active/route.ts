import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { setActiveClientCookie, ALL_CLIENTS, listAccessibleClients } from "@/lib/active-client"

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  const { clientId } = body as { clientId?: string }
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 })

  // Agency view: cookie stores the sentinel and read-only routes will resolve
  // it via getActiveClientScope. Only allow it when the user actually has
  // multiple accessible clients — otherwise it's nonsensical.
  if (clientId === ALL_CLIENTS) {
    const clients = await listAccessibleClients(session.user.id)
    if (clients.length < 2) {
      return NextResponse.json({ error: "Você precisa de pelo menos 2 clientes para usar a visão agência." }, { status: 400 })
    }
    await setActiveClientCookie(ALL_CLIENTS)
    return NextResponse.json({ ok: true, mode: "all" })
  }

  const [c] = await db
    .select()
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.userId, session.user.id)))

  if (!c) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

  await setActiveClientCookie(clientId)
  return NextResponse.json({ ok: true, client: c })
}
