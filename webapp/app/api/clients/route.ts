import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client, clientMember } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { generateId } from "@/lib/utils"
import { getActiveClient, listAccessibleClients, isAgencyMode } from "@/lib/active-client"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const active = await getActiveClient(userId)
  const clients = await listAccessibleClients(userId)
  const agencyMode = await isAgencyMode()

  const memberRows = clients.length
    ? await db
        .select()
        .from(clientMember)
        .where(and(
          eq(clientMember.userId, userId),
          inArray(clientMember.clientId, clients.map((c) => c.id))
        ))
    : []

  const roleByClient = new Map(memberRows.map((m) => [m.clientId, m.role]))

  const result = clients
    .map((c) => ({
      ...c,
      role: roleByClient.get(c.id) ?? (c.userId === userId ? "owner" : "member"),
    }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  return NextResponse.json({
    clients: result,
    activeClientId: active.id,
    agencyMode,
  })
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const { name, logoUrl } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

  const newClient = {
    id: generateId(),
    userId,
    name: name.trim(),
    logoUrl: logoUrl ?? null,
  }
  await db.insert(client).values(newClient)
  await db.insert(clientMember).values({
    id: generateId(),
    clientId: newClient.id,
    userId,
    role: "owner",
  })
  return NextResponse.json({ client: newClient })
}
