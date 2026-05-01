import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { setActiveClientCookie } from "@/lib/active-client"

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { clientId } = await req.json()
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 })

  const [c] = await db
    .select()
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.userId, session.user.id)))

  if (!c) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

  await setActiveClientCookie(clientId)
  return NextResponse.json({ ok: true, client: c })
}
