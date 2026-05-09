import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"

// Auto-detect heuristic for the field mapping form. Walks the connected
// database's schema (and the contact-relation's target DB if found) to
// suggest values for the 5 approval fields + the basic publish fields.
// Returns a suggested partial mapping the UI fills in — the user
// reviews + saves. We don't auto-save because heuristics can be wrong;
// the UX should be "preencher" not "configurar".
//
// Confidence levels per field:
//   high   — exact name match or unique type
//   medium — fuzzy regex match
//   low    — fallback / single candidate
//
// Owner-scoped: ties to the user's own notionConnection row.

type SuggestedMapping = {
  // Core publish fields
  titleField?: string
  captionField?: string
  publicarEmField?: string
  statusField?: string
  statusReadyValue?: string
  statusPublishedValue?: string
  statusErrorValue?: string
  dateField?: string
  accountField?: string
  // Media
  mediaVerticalField?: string
  mediaHorizontalField?: string
  mediaFeedField?: string
  thumbnailField?: string
  // Approval flow
  awaitingApprovalValue?: string
  revisionRequestedValue?: string
  clientContactField?: string
  contactEmailField?: string
  contactPhoneField?: string
  // Post-publish
  postUrlField?: string
  socialVpField?: string
}

type Confidence = Record<keyof SuggestedMapping, "high" | "medium" | "low">

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: connectionId } = await params

  const [connection] = await db
    .select()
    .from(notionConnection)
    .where(and(
      eq(notionConnection.id, connectionId),
      eq(notionConnection.userId, session.user.id),
    ))

  if (!connection) {
    return NextResponse.json({ error: "Conexão Notion não encontrada" }, { status: 404 })
  }
  if (!connection.databaseId) {
    return NextResponse.json({ error: "Conecte um banco de dados antes" }, { status: 400 })
  }

  try {
    const notion = new Client({ auth: connection.accessToken })
    const database = await notion.databases.retrieve({ database_id: connection.databaseId })
    const properties = (database as any).properties as Record<string, any>

    const suggested: SuggestedMapping = {}
    const confidence = {} as Confidence

    // Helpers
    const propsArray = Object.entries(properties).map(([name, p]) => ({ name, raw: p as any, type: (p as any).type as string }))
    const byType = (t: string) => propsArray.filter((p) => p.type === t)
    const findByName = (regex: RegExp) => propsArray.find((p) => regex.test(p.name))
    function pickOption(prop: any, regex: RegExp): string | undefined {
      const opts: string[] = (prop?.status?.options ?? prop?.select?.options ?? []).map((o: any) => o.name).filter(Boolean)
      return opts.find((n) => regex.test(n))
    }
    function set<K extends keyof SuggestedMapping>(key: K, value: string | undefined, c: "high" | "medium" | "low") {
      if (value) {
        suggested[key] = value
        confidence[key] = c
      }
    }

    // Title field — Notion enforces exactly one
    set("titleField", byType("title")[0]?.name, "high")

    // Status field — usually just one
    const statusProp = byType("status")[0] ?? byType("select").find((p) => /status/i.test(p.name))
    if (statusProp) {
      set("statusField", statusProp.name, statusProp.type === "status" ? "high" : "medium")
      // Status values
      const raw = (statusProp.raw as any)
      const ready = pickOption(raw, /agendamento|pronto|publicar|ready/i)
      const published = pickOption(raw, /publicado|published/i)
      const errorVal = pickOption(raw, /erro|fail|error|fail/i)
      const awaiting = pickOption(raw, /aguardando|aprovação|approval|awaiting/i)
      const revision = pickOption(raw, /revis[ãa]o|revision|alter/i)
      set("statusReadyValue", ready, "medium")
      set("statusPublishedValue", published, "medium")
      set("statusErrorValue", errorVal, "medium")
      set("awaitingApprovalValue", awaiting, "medium")
      set("revisionRequestedValue", revision, "medium")
    }

    // Date field — pick a `date` property, prefer one named "agendamento", "publicação", "data"
    const dateProps = byType("date")
    const dateMatch = dateProps.find((p) => /agendar|agendamento|publicar|publicação|publication|fazer|publish/i.test(p.name))
      ?? dateProps.find((p) => /data|date/i.test(p.name))
      ?? dateProps[0]
    set("dateField", dateMatch?.name, dateMatch ? (/(agendar|agendamento|publicar|fazer)/i.test(dateMatch.name) ? "high" : "medium") : "low")

    // Caption — rich_text named "legenda", "caption", "descrição"
    const richTexts = byType("rich_text")
    const caption = richTexts.find((p) => /legenda|caption|descri/i.test(p.name)) ?? richTexts[0]
    if (caption) set("captionField", caption.name, /(legenda|caption)/i.test(caption.name) ? "high" : "low")

    // "Publicar em" — multi_select that looks like targets
    const multi = byType("multi_select")
    const publicarEm = multi.find((p) => /publicar|target|onde|plataforma|publish|where/i.test(p.name)) ?? multi[0]
    if (publicarEm) set("publicarEmField", publicarEm.name, /(publicar|target)/i.test(publicarEm.name) ? "high" : "low")

    // Conta / account — relation OR select named "conta"
    const conta = findByName(/^conta$|account|cliente|brand|marca/i)
    if (conta) set("accountField", conta.name, /^conta$/i.test(conta.name) ? "high" : "medium")

    // Media — files-and-media properties named for vertical/horizontal/feed/thumb
    const files = byType("files")
    const vertical = files.find((p) => /vertical|9.*16|reel|story|short/i.test(p.name))
    const horizontal = files.find((p) => /horizontal|16.*9|youtube long/i.test(p.name))
    const feed = files.find((p) => /feed|imagem|carrossel|carousel|post|fotos/i.test(p.name))
    const thumb = files.find((p) => /thumb|capa|cover/i.test(p.name))
    if (vertical) set("mediaVerticalField", vertical.name, "high")
    if (horizontal) set("mediaHorizontalField", horizontal.name, "high")
    if (feed) set("mediaFeedField", feed.name, "high")
    if (thumb) set("thumbnailField", thumb.name, "high")

    // Post URL field (rich_text where we write back the published links)
    const postUrl = richTexts.find((p) => /links?\s*publi|published|post.*url|link.*pub/i.test(p.name))
    if (postUrl) set("postUrlField", postUrl.name, "high")

    // Social VP url (URL property pointing back to the app)
    const urlProps = byType("url")
    const socialVp = urlProps.find((p) => /social\s*vp|app|vp\s*social/i.test(p.name)) ?? urlProps[0]
    if (socialVp) set("socialVpField", socialVp.name, /social.*vp/i.test(socialVp.name) ? "high" : "low")

    // ─── Approval contact resolution ────────────────────────────
    // Find a relation property that looks like "contato" / "cliente" /
    // "approver". Then walk it to its target DB to find email + phone.
    const relations = propsArray.filter((p) => p.type === "relation")
    const contactRel =
      relations.find((p) => /contato|cliente|approver|aprovador/i.test(p.name))
      ?? relations.find((p) => /contact/i.test(p.name))
      ?? relations[0]
    if (contactRel) {
      set("clientContactField", contactRel.name, /(contato|contact|approver|aprovador)/i.test(contactRel.name) ? "high" : "low")
      const targetDbId = (contactRel.raw as any)?.relation?.database_id
      if (targetDbId) {
        try {
          const targetDb = await notion.databases.retrieve({ database_id: targetDbId })
          const targetProps = Object.entries((targetDb as any).properties ?? {}).map(([name, p]) => ({
            name,
            type: (p as any).type as string,
          }))
          // Email — prefer email-typed prop, else fuzzy text match
          const emailField =
            targetProps.find((p) => p.type === "email")
            ?? targetProps.find((p) => /e-?mail/i.test(p.name))
          if (emailField) {
            set(
              "contactEmailField",
              emailField.name,
              emailField.type === "email" ? "high" : "medium",
            )
          }
          // Phone — prefer phone-typed prop, else fuzzy
          const phoneField =
            targetProps.find((p) => p.type === "phone_number")
            ?? targetProps.find((p) => /telefone|whatsapp|celular|phone|tel\b|\bwa\b/i.test(p.name))
          if (phoneField) {
            set(
              "contactPhoneField",
              phoneField.name,
              phoneField.type === "phone_number" ? "high" : "medium",
            )
          }
        } catch (e) {
          // Target DB may not be shared with the integration, or relation
          // points to a deleted DB. Skip contact-side fields without
          // failing the whole detection.
          console.warn(`[auto-detect] target relation DB unreachable: ${e}`)
        }
      }
    }

    return NextResponse.json({ suggested, confidence })
  } catch (e) {
    console.error("auto-detect error:", e)
    const message = e instanceof Error ? e.message : "Falha ao analisar a base do Notion"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
