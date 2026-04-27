import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { tasks } from "@trigger.dev/sdk/v3"
import { db } from "@/lib/db"
import { notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { publishForConnection } from "@/trigger/publish"

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const connections = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.userId, session.user.id))

  const configured = connections.filter((c) => c.databaseId)
  if (!configured.length) {
    return NextResponse.json({ triggered: false, reason: "no_connections" })
  }

  const handles = await Promise.all(
    configured.map((c) =>
      tasks.trigger<typeof publishForConnection>("publish-for-connection", {
        connectionId: c.id,
      })
    )
  )

  return NextResponse.json({ triggered: true, count: handles.length, ids: handles.map((h) => h.id) })
}
