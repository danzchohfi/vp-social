import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client, fieldMapping, notionConnection } from "@/lib/db/schema"
import { eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { listAccessibleClients, userHasClientAccess } from "@/lib/active-client"

/**
 * Returns available `conta` values from EVERY Notion DB the agency has
 * connected (across all accessible clients), not just this client's
 * connection. Backs the multi-select on /clients/[id]/edit.
 *
 * Why agency-wide: a Notion connection might be attached to client A
 * (Vitamina) but contain posts tagged with conta="ComparaCar". When the
 * agency is editing client B (ComparaCar) to mark "ComparaCar" as one
 * of its contas, the option needs to be visible there — even though B
 * has no connection of its own. The previous per-client scan returned
 * empty for B and forced the user into manual entry.
 *
 * Also returns `sources`: list of which (connection, db) each option
 * came from. Used by the UI to render "lendo de N conexões".
 *
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

  const accessible = await listAccessibleClients(session.user.id)
  const accessibleIds = accessible.map((a) => a.id)
  const connections = accessibleIds.length
    ? await db.select().from(notionConnection).where(inArray(notionConnection.clientId, accessibleIds))
    : []

  const ready = connections.filter((conn) => conn.databaseId)
  if (ready.length === 0) {
    return NextResponse.json({
      contas: [],
      current: c.notionContaValues ?? [],
      sources: [],
    })
  }

  const seen = new Map<string, string>() // lowercase → first-seen casing
  const sources: Array<{ workspaceName: string | null; dbName: string | null; accountField: string }> = []
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
    sources.push({
      workspaceName: conn.workspaceName ?? null,
      dbName: conn.databaseName ?? null,
      accountField: mapping.accountField,
    })
  }

  return NextResponse.json({
    contas: Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "pt-BR")),
    current: c.notionContaValues ?? [],
    sources,
  })
}
