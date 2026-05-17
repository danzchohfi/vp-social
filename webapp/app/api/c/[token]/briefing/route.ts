import { db } from "@/lib/db"
import { client as clientTable, notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

// GET /api/c/[token]/briefing — retorna propriedades da page Notion
// configurada em client.briefingNotionPageId. Tipicamente um row da
// DB "Formulários de Briefing VP" — cada pergunta vira uma property
// na page, com a resposta do cliente preenchida.
//
// Renderiza propriedades genericamente por tipo: text/title → string,
// select/status → name, multi_select → name[], number → number, date
// → ISO. Tipos exóticos (rollup, formula) caem pra plain_text quando
// possível.

type BriefingField = {
  name: string
  type: string
  value: string | string[] | number | null
}

function extractValue(prop: any): BriefingField["value"] {
  if (!prop) return null
  switch (prop.type) {
    case "title":
      return (prop.title ?? []).map((t: any) => t.plain_text ?? "").join("")
    case "rich_text":
      return (prop.rich_text ?? []).map((t: any) => t.plain_text ?? "").join("")
    case "select":
      return prop.select?.name ?? null
    case "status":
      return prop.status?.name ?? null
    case "multi_select":
      return (prop.multi_select ?? []).map((o: any) => o.name).filter(Boolean)
    case "number":
      return typeof prop.number === "number" ? prop.number : null
    case "date":
      return prop.date?.start ?? null
    case "checkbox":
      return prop.checkbox ? "Sim" : "Não"
    case "url":
      return typeof prop.url === "string" ? prop.url : null
    case "email":
      return typeof prop.email === "string" ? prop.email : null
    case "phone_number":
      return typeof prop.phone_number === "string" ? prop.phone_number : null
    case "people":
      return (prop.people ?? []).map((p: any) => p.name ?? p.id).filter(Boolean)
    case "files":
      return (prop.files ?? []).map((f: any) => f.type === "external" ? f.external.url : f.file?.url).filter(Boolean)
    case "formula":
      if (prop.formula?.type === "string") return prop.formula.string ?? null
      if (prop.formula?.type === "number") return prop.formula.number ?? null
      if (prop.formula?.type === "boolean") return prop.formula.boolean ? "Sim" : "Não"
      if (prop.formula?.type === "date") return prop.formula.date?.start ?? null
      return null
    case "rollup":
      if (prop.rollup?.type === "string") return prop.rollup.string ?? null
      if (prop.rollup?.type === "number") return prop.rollup.number ?? null
      if (prop.rollup?.type === "array") {
        return (prop.rollup.array ?? [])
          .map((item: any) => {
            const v = extractValue(item)
            return Array.isArray(v) ? v.join(", ") : String(v ?? "")
          })
          .filter(Boolean)
      }
      return null
    case "created_time":
      return prop.created_time ?? null
    case "last_edited_time":
      return prop.last_edited_time ?? null
    default:
      return null
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const ip = clientIp(req)
  if (checkRateLimit(`briefing:${ip}`, { max: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  const [client] = await db
    .select()
    .from(clientTable)
    .where(eq(clientTable.publicCalendarToken, token))
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 })

  if (!client.briefingNotionPageId) {
    return NextResponse.json({ configured: false })
  }

  const conns = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, client.id))
  const conn = conns[0]
  if (!conn) {
    return NextResponse.json({
      configured: true,
      error: "Sem Notion conectado pra esse cliente",
    }, { status: 404 })
  }

  try {
    const notion = new Client({ auth: conn.accessToken })
    const page: any = await notion.pages.retrieve({ page_id: client.briefingNotionPageId })
    if (!("properties" in page)) {
      return NextResponse.json({ configured: true, error: "Página Notion inválida" }, { status: 404 })
    }
    const fields: BriefingField[] = []
    for (const [name, prop] of Object.entries(page.properties as Record<string, any>)) {
      const value = extractValue(prop)
      // Esconde propriedades vazias — briefing menos poluído.
      if (value == null) continue
      if (typeof value === "string" && !value.trim()) continue
      if (Array.isArray(value) && value.length === 0) continue
      fields.push({ name, type: prop.type, value })
    }
    return NextResponse.json({
      configured: true,
      pageUrl: page.url ?? null,
      lastEditedTime: page.last_edited_time ?? null,
      fields,
    })
  } catch (e) {
    console.warn(`[/api/c/${token}/briefing] failed:`, e)
    return NextResponse.json({
      configured: true,
      error: "Não foi possível carregar do Notion",
    }, { status: 502 })
  }
}
