import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client, fieldMapping, notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { userHasClientAccess } from "@/lib/active-client"

/**
 * Returns the available `conta` values from this client's connected Notion
 * database(s). Backs the multi-select on /clients/[id]/edit so the agency
 * can declare which Notion contas belong to this client (replacing the
 * implicit name-match heuristic that misses cross-tenant scenarios where
 * one Notion connection serves multiple agency clients).
 *
 * Aggregates across all of the client's connections (usually just one).
 * Dedupes case-insensitively but preserves first-seen casing for display.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const ok = await userHasClientAccess(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const [c] = await db.select().from(client).where(eq(client.id, id))
  if (!c) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

  const connections = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, id))

  const ready = connections.filter((conn) => conn.databaseId)
  if (ready.length === 0) {
    return NextResponse.json({ contas: [], current: c.notionContaValues ?? [] })
  }

  const seen = new Map<string, string>() // lowercase → first-seen casing
  for (const conn of ready) {
    const [mappingRow] = await db
      .select()
      .from(fieldMapping)
      .where(eq(fieldMapping.connectionId, conn.id))
    const mapping = mappingRow ?? DEFAULT_MAPPING

    const notion = createNotionClient(conn.accessToken)
    const options = await notion.listAccountFieldOptions(conn.databaseId!, mapping.accountField)
    for (const opt of options) {
      const key = opt.toLowerCase()
      if (!seen.has(key)) seen.set(key, opt)
    }
  }

  return NextResponse.json({
    contas: Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "pt-BR")),
    current: c.notionContaValues ?? [],
  })
}
