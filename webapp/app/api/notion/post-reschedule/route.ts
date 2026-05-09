import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { fieldMapping, notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"
import { DEFAULT_MAPPING } from "@/lib/notion"
import { userHasClientAccess } from "@/lib/active-client"

// Reschedule a Notion post by updating the dateField property. Used by
// drag-and-drop on the /scheduled calendar — agency drops a post on a
// new day, we PATCH the Notion page's date so the cron picks it up
// from the new date on the next tick.
//
// We preserve the original time-of-day when the user drops on a new
// date — only the YYYY-MM-DD portion changes. If the user explicitly
// wants to change the time, they can edit the Notion page directly
// (we don't expose a time picker in the calendar yet).
//
// Body: { pageId, connectionId, newDateIso }
//   newDateIso: ISO 8601 date OR datetime — only the date portion is
//   used; original time is preserved from the existing Notion value.

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | { pageId?: unknown; connectionId?: unknown; newDateIso?: unknown }
    | null
  const pageId = typeof body?.pageId === "string" ? body.pageId.trim() : ""
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : ""
  const newDateIso = typeof body?.newDateIso === "string" ? body.newDateIso.trim() : ""
  if (!pageId || !connectionId || !newDateIso) {
    return NextResponse.json({ error: "pageId, connectionId, newDateIso obrigatórios" }, { status: 400 })
  }

  const [connection] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.id, connectionId))
  if (!connection) {
    return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 })
  }
  // Owner of the connection can always edit. Agency members get access
  // through clientId.
  const accessOk = connection.userId === session.user.id
    || (connection.clientId && await userHasClientAccess(session.user.id, connection.clientId))
  if (!accessOk) {
    return NextResponse.json({ error: "Sem acesso a esta conexão" }, { status: 403 })
  }

  const [mapping] = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, connectionId))
  const dateField = mapping?.dateField ?? DEFAULT_MAPPING.dateField
  if (!dateField) {
    return NextResponse.json({ error: "Campo de data não configurado em /settings" }, { status: 400 })
  }

  // Parse the requested date. We only use YYYY-MM-DD; time-of-day
  // comes from whatever the page already had.
  const parsed = new Date(newDateIso)
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "newDateIso inválido" }, { status: 400 })
  }
  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, "0")
  const dd = String(parsed.getDate()).padStart(2, "0")
  const newYmd = `${yyyy}-${mm}-${dd}`

  const notion = new Client({ auth: connection.accessToken })

  // Read current value to preserve time + timezone.
  let preservedDate = `${newYmd}T09:00:00`
  try {
    const page = await notion.pages.retrieve({ page_id: pageId })
    if ("properties" in page) {
      const cur = (page as any).properties?.[dateField]?.date?.start
      if (typeof cur === "string" && cur.includes("T")) {
        // Preserve everything after the date portion (time + tz).
        const [, timePart] = cur.split("T")
        preservedDate = `${newYmd}T${timePart}`
      } else if (typeof cur === "string") {
        // Pure date — keep as date only.
        preservedDate = newYmd
      }
    }
  } catch (e) {
    console.warn(`[post-reschedule] couldn't read current date for ${pageId}:`, e)
  }

  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        [dateField]: { date: { start: preservedDate } },
      } as any,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao atualizar Notion"
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  return NextResponse.json({ ok: true, newDate: preservedDate })
}
