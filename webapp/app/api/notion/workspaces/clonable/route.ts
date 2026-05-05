import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client, fieldMapping, notionConnection } from "@/lib/db/schema"
import { and, eq, inArray, ne } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getAccessibleClientIds } from "@/lib/active-client"

// Workspaces (across every client the user has access to) that have a saved
// fieldMapping — these are the only useful sources to clone from. Used by the
// "Copiar configuração de outro workspace" widget when setting up a new client.
// excludeConnectionId: omit a specific connection (the one the user is currently
// configuring) so the dropdown can't offer self-cloning.
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const excludeId = url.searchParams.get("excludeConnectionId") ?? ""

  const clientIds = await getAccessibleClientIds(session.user.id)
  if (!clientIds.length) return NextResponse.json([])

  const rows = await db
    .select({
      id: notionConnection.id,
      workspaceName: notionConnection.workspaceName,
      databaseName: notionConnection.databaseName,
      clientId: notionConnection.clientId,
      clientName: client.name,
    })
    .from(fieldMapping)
    .innerJoin(notionConnection, eq(fieldMapping.connectionId, notionConnection.id))
    .leftJoin(client, eq(client.id, notionConnection.clientId))
    .where(
      and(
        eq(notionConnection.userId, session.user.id),
        inArray(notionConnection.clientId, clientIds),
        excludeId ? ne(notionConnection.id, excludeId) : undefined,
      )
    )

  return NextResponse.json(rows)
}
