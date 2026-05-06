import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client, notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getOrCreateClientCalendarToken } from "@/lib/approval-link"
import { userIsClientOwner } from "@/lib/active-client"

// Returns the per-client config the agency uses to enable the approval
// flow: the public calendar URL (lazily creates the permanent token) +
// ManyChat creds. Owner-only because the API key is sensitive.
//
// The PATCH for ManyChat fields lives on /api/clients/[id] (same handler
// that PATCHes name/logoUrl).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const isOwner = await userIsClientOwner(session.user.id, id)
  if (!isOwner) {
    return NextResponse.json({ error: "Apenas o owner do cliente pode ver/editar a config de aprovação." }, { status: 403 })
  }

  const [row] = await db
    .select({
      manychatApiKey: client.manychatApiKey,
      manychatApprovalFlowNs: client.manychatApprovalFlowNs,
    })
    .from(client)
    .where(eq(client.id, id))

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Lazy create — first call generates the token. Idempotent.
  const calendarToken = await getOrCreateClientCalendarToken(id)

  // Connections for this client — populates the test-dispatch dropdown
  // so the agency doesn't have to look up connectionId by hand.
  const connections = await db
    .select({
      id: notionConnection.id,
      workspaceName: notionConnection.workspaceName,
      databaseName: notionConnection.databaseName,
    })
    .from(notionConnection)
    .where(eq(notionConnection.clientId, id))

  return NextResponse.json({
    calendarToken,
    calendarPath: `/c/${calendarToken}`,
    manychatApiKey: row.manychatApiKey ?? "",
    manychatApprovalFlowNs: row.manychatApprovalFlowNs ?? "",
    connections,
  })
}
