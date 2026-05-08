import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { fieldMapping, notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { Client as NotionApiClient } from "@notionhq/client"
import { DEFAULT_MAPPING } from "@/lib/notion"
import { userHasClientAccess } from "@/lib/active-client"

/**
 * Returns every distinct value of the connected Notion DB's `accountField`
 * so the client-settings UI can render a multi-select. The user picks
 * which of these values map to this VP Social client; saved into
 * `client.notionContaValues` and used as the explicit filter in the
 * scheduled/calendar APIs.
 *
 * Source depends on the property type:
 *   - select / status:        prop.<type>.options[].name
 *   - multi_select:           same
 *   - relation:               page titles of every row in the related DB
 *                             (capped at 100 — agencies with bigger lists
 *                             can paginate later, this is enough for v1)
 *   - title / rich_text:      distinct values from posts (best-effort,
 *                             100-row sample; users with free-text contas
 *                             should switch property type)
 *
 * Aggregates across every notionConnection on this client (an agency may
 * have 1+ workspaces) and dedupes case-preserving.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const ok = await userHasClientAccess(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const connections = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, id))

  const ready = connections.filter((c) => c.databaseId)
  if (ready.length === 0) {
    return NextResponse.json({
      options: [],
      reason: "no_connection" as const,
      message: "Conecte o Notion e selecione um banco de dados primeiro.",
    })
  }

  const allValues = new Set<string>()
  const sources: Array<{ workspaceName: string; propType: string; count: number }> = []

  for (const conn of ready) {
    const [m] = await db
      .select()
      .from(fieldMapping)
      .where(eq(fieldMapping.connectionId, conn.id))
    const mapping = m ?? DEFAULT_MAPPING

    const notion = new NotionApiClient({ auth: conn.accessToken })
    try {
      const database = (await notion.databases.retrieve({ database_id: conn.databaseId! })) as any
      const prop = database.properties?.[mapping.accountField]
      if (!prop) {
        sources.push({ workspaceName: conn.workspaceName, propType: "missing", count: 0 })
        continue
      }

      const collected: string[] = []

      if (prop.type === "select" || prop.type === "status") {
        for (const opt of prop[prop.type]?.options ?? []) {
          if (opt.name) collected.push(opt.name)
        }
      } else if (prop.type === "multi_select") {
        for (const opt of prop.multi_select?.options ?? []) {
          if (opt.name) collected.push(opt.name)
        }
      } else if (prop.type === "relation" && prop.relation?.database_id) {
        // Walk the relation target DB and collect title fields.
        let cursor: string | undefined
        let pulled = 0
        while (pulled < 100) {
          const res: any = await notion.databases.query({
            database_id: prop.relation.database_id,
            page_size: Math.min(100, 100 - pulled),
            start_cursor: cursor,
          })
          for (const page of res.results) {
            const titleProp = Object.values(page.properties ?? {}).find(
              (p: any) => p.type === "title",
            ) as any
            const title = (titleProp?.title ?? [])
              .map((t: any) => t.plain_text ?? "")
              .join("")
              .trim()
            if (title) collected.push(title)
          }
          pulled += res.results.length
          if (!res.has_more) break
          cursor = res.next_cursor
        }
      } else if (prop.type === "title" || prop.type === "rich_text") {
        // Fallback: sample the first 100 rows of the main DB and pull
        // distinct text values. Useful when accountField is mistyped as
        // free-text — better than nothing, but the UI nudges users to
        // migrate the property to Select.
        const res: any = await notion.databases.query({
          database_id: conn.databaseId!,
          page_size: 100,
        })
        for (const page of res.results) {
          const p = page.properties?.[mapping.accountField]
          if (!p) continue
          const text = (p[prop.type] ?? [])
            .map((t: any) => t.plain_text ?? "")
            .join("")
            .trim()
          if (text) collected.push(text)
        }
      }

      sources.push({ workspaceName: conn.workspaceName, propType: prop.type, count: collected.length })
      for (const v of collected) allValues.add(v)
    } catch (e) {
      console.warn(
        `[notion-conta-options] connection ${conn.id} (${conn.workspaceName}) failed:`,
        e instanceof Error ? e.message : e,
      )
      sources.push({ workspaceName: conn.workspaceName, propType: "error", count: 0 })
    }
  }

  const options = Array.from(allValues).sort((a, b) => a.localeCompare(b, "pt-BR"))
  return NextResponse.json({ options, sources })
}
