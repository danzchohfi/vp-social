import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { generateId } from "@/lib/utils"
import { getActiveClient } from "@/lib/active-client"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id

  // Ensures backfill happens on first call
  const active = await getActiveClient(userId)

  const clients = await db
    .select()
    .from(client)
    .where(eq(client.userId, userId))
    .orderBy(client.createdAt)

  return NextResponse.json({ clients, activeClientId: active.id })
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, logoUrl } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })
  }

  const newClient = {
    id: generateId(),
    userId: session.user.id,
    name: name.trim(),
    logoUrl: logoUrl ?? null,
  }
  await db.insert(client).values(newClient)
  return NextResponse.json({ client: newClient })
}
