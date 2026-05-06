import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection, fieldMapping } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { userHasClientAccess } from "@/lib/active-client"

// Manual retry: flips a failed Notion page back to the "ready" status value
// so the next cron tick picks it up. The cron's idempotency pre-check
// (a3c4366) ensures only platforms that DON'T have a 'published' row in
// publish_log get retried — successful platforms are skipped.
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 })
  }
  const pageId = typeof body.pageId === "string" ? body.pageId : ""
  const connectionId = typeof body.connectionId === "string" ? body.connectionId : ""
  if (!pageId || !connectionId) {
    return NextResponse.json({ error: "pageId e connectionId obrigatórios" }, { status: 400 })
  }

  // Look up by id only — gate via userHasClientAccess below so members of
  // an agency-scope client can retry posts of that client (same fix as
  // publish-now in 029b16e).
  const [connection] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.id, connectionId))

  if (!connection) {
    return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 })
  }
  const accessOk = connection.userId === userId
    || (connection.clientId && await userHasClientAccess(userId, connection.clientId))
  if (!accessOk) {
    return NextResponse.json({ error: "Sem acesso a esta conexão" }, { status: 403 })
  }

  const [mappingRow] = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, connectionId))

  const mapping = mappingRow ?? DEFAULT_MAPPING
  const notion = createNotionClient(connection.accessToken)

  try {
    await notion.markReady(pageId, mapping)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao reagendar no Notion"
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
