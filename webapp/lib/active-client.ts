import { cookies } from "next/headers"
import { db } from "./db"
import * as schema from "./db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { generateId } from "./utils"

const COOKIE_NAME = "publify_client_id"

export type Client = typeof schema.client.$inferSelect

/**
 * Returns the active client for the user.
 * - If user has 0 clients, creates a default and backfills any orphan rows
 *   (notionConnection / instagramAccount / publishLog without clientId).
 * - Otherwise reads the active client from the cookie, falling back to the first.
 */
export async function getActiveClient(userId: string): Promise<Client> {
  const clients = await db
    .select()
    .from(schema.client)
    .where(eq(schema.client.userId, userId))

  if (!clients.length) {
    const newClient: typeof schema.client.$inferInsert = {
      id: generateId(),
      userId,
      name: "Cliente padrão",
      logoUrl: null,
    }
    await db.insert(schema.client).values(newClient)

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
