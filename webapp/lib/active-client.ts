import { cookies } from "next/headers"
import { db } from "./db"
import * as schema from "./db/schema"
import { eq, and, isNull, inArray } from "drizzle-orm"
import { generateId } from "./utils"

const COOKIE_NAME = "vpsocial_client_id"

export type Client = typeof schema.client.$inferSelect

export async function listAccessibleClients(userId: string): Promise<Client[]> {
  const owned = await db
    .select()
    .from(schema.client)
    .where(eq(schema.client.userId, userId))

  const memberRows = await db
    .select({ client: schema.client })
    .from(schema.clientMember)
    .innerJoin(schema.client, eq(schema.client.id, schema.clientMember.clientId))
    .where(eq(schema.clientMember.userId, userId))

  const all: Client[] = [...owned]
  for (const row of memberRows) {
    if (!all.find((c) => c.id === row.client.id)) all.push(row.client)
  }
  return all
}

export async function getActiveClient(userId: string): Promise<Client> {
  const clients = await listAccessibleClients(userId)

  if (!clients.length) {
    const newClient: typeof schema.client.$inferInsert = {
      id: generateId(),
      userId,
      name: "Cliente padrão",
      logoUrl: null,
    }
    await db.insert(schema.client).values(newClient)
    await db.insert(schema.clientMember).values({
      id: generateId(),
      clientId: newClient.id,
      userId,
      role: "owner",
    })

    await Promise.all([
      db.update(schema.notionConnection)
        .set({ clientId: newClient.id })
        .where(and(eq(schema.notionConnection.userId, userId), isNull(schema.notionConnection.clientId))),
      db.update(schema.instagramAccount)
        .set({ clientId: newClient.id })
        .where(and(eq(schema.instagramAccount.userId, userId), isNull(schema.instagramAccount.clientId))),
      db.update(schema.publishLog)
        .set({ clientId: newClient.id })
        .where(and(eq(schema.publishLog.userId, userId), isNull(schema.publishLog.clientId))),
    ])

    const [created] = await db
      .select()
      .from(schema.client)
      .where(eq(schema.client.id, newClient.id))
    return created
  }

  const ownedIds = clients.filter((c) => c.userId === userId).map((c) => c.id)
  if (ownedIds.length) {
    const existing = await db
      .select({ clientId: schema.clientMember.clientId })
      .from(schema.clientMember)
      .where(and(eq(schema.clientMember.userId, userId), inArray(schema.clientMember.clientId, ownedIds)))
    const existingSet = new Set(existing.map((r) => r.clientId))
    const missing = ownedIds.filter((id) => !existingSet.has(id))
    if (missing.length) {
      await db.insert(schema.clientMember).values(
        missing.map((cid) => ({
          id: generateId(),
          clientId: cid,
          userId,
          role: "owner",
        }))
      )
    }
  }

  const cookieStore = await cookies()
  const stored = cookieStore.get(COOKIE_NAME)?.value
  if (stored) {
    const found = clients.find((c) => c.id === stored)
    if (found) return found
  }
  return clients[0]
}

export async function getActiveClientId(userId: string): Promise<string> {
  const c = await getActiveClient(userId)
  return c.id
}

export async function setActiveClientCookie(clientId: string) {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, clientId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
}

export async function userHasClientAccess(userId: string, clientId: string): Promise<boolean> {
  const clients = await listAccessibleClients(userId)
  return clients.some((c) => c.id === clientId)
}

export async function userIsClientOwner(userId: string, clientId: string): Promise<boolean> {
  const [c] = await db
    .select()
    .from(schema.client)
    .where(and(eq(schema.client.id, clientId), eq(schema.client.userId, userId)))
  if (c) return true
  const [m] = await db
    .select()
    .from(schema.clientMember)
    .where(and(
      eq(schema.clientMember.clientId, clientId),
      eq(schema.clientMember.userId, userId),
      eq(schema.clientMember.role, "owner")
    ))
  return !!m
}
