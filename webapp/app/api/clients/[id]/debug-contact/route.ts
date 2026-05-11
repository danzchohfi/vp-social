import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { fieldMapping, notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { Client } from "@notionhq/client"

// Debug endpoint: walks resolveContact step-by-step on a real post
// and returns every intermediate piece. Lets the agency see exactly
// WHY the wrong contact is being picked when "Testar com meu próprio
// WhatsApp" doesn't deliver the expected number.
//
// Query: /api/clients/[id]/debug-contact?pageId=<notion-page-id>
//   If pageId omitted, picks the first post whose status matches
//   mapping.awaitingApprovalValue (whatever the cron sweep picks).
//
// Returns the full trace: which property was resolved, what its
// type was, what items were inside rollup.array, which contact
// IDs were extracted, the contact page title, every phone-typed
// property + the one picked. Verbose on purpose.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const ok = await userIsClientOwner(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const url = new URL(req.url)
  const explicitPageId = url.searchParams.get("pageId")

  const [conn] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, id))
    .limit(1)
  if (!conn) return NextResponse.json({ error: "Sem conexão Notion neste cliente" }, { status: 400 })
  if (!conn.databaseId) return NextResponse.json({ error: "Conexão sem banco de dados selecionado" }, { status: 400 })

  const [m] = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, conn.id))
  if (!m || !m.clientContactField) {
    return NextResponse.json({ error: "Mapeamento sem campo de Contato configurado em /settings" }, { status: 400 })
  }

  const client = new Client({ auth: conn.accessToken })
  const trace: any[] = []
  const log = (step: string, data: any) => trace.push({ step, ...data })

  // Resolve a target post.
  let postId = explicitPageId ?? null
  if (!postId) {
    if (!m.awaitingApprovalValue) {
      return NextResponse.json({ error: "Sem awaitingApprovalValue configurado em /settings (necessário pra encontrar um post de teste)" }, { status: 400 })
    }
    const approvalFieldName = (m.approvalStatusField?.trim() || m.statusField)
    log("scan_for_awaiting_post", { property: approvalFieldName, value: m.awaitingApprovalValue })
    try {
      let res: any
      try {
        res = await client.databases.query({
          database_id: conn.databaseId,
          filter: { property: approvalFieldName, status: { equals: m.awaitingApprovalValue } },
          page_size: 1,
        })
      } catch (e) {
        // Try select shape if status fails.
        res = await client.databases.query({
          database_id: conn.databaseId,
          filter: { property: approvalFieldName, select: { equals: m.awaitingApprovalValue } },
          page_size: 1,
        })
      }
      postId = res?.results?.[0]?.id ?? null
      log("scan_result", { foundPostId: postId, count: res?.results?.length ?? 0 })
    } catch (e) {
      log("scan_error", { error: String(e) })
    }
  }
  if (!postId) {
    return NextResponse.json({ error: "Nenhum post encontrado em status de aprovação. Passa um ?pageId=<id> ou marca um post no Notion.", trace }, { status: 404 })
  }

  // Step: retrieve the post
  let postPage: any
  try {
    postPage = await client.pages.retrieve({ page_id: postId })
  } catch (e) {
    return NextResponse.json({ error: `Falha ao buscar a página: ${e}`, trace }, { status: 500 })
  }
  if (!("properties" in postPage)) {
    return NextResponse.json({ error: "Página sem properties (ID inválido?)", trace }, { status: 400 })
  }
  const props = postPage.properties

  // Step: inspect the mapped contact field
  const fieldName = m.clientContactField
  const mappedProp = props[fieldName]
  log("mapped_field", {
    field: fieldName,
    type: mappedProp?.type ?? "MISSING",
    raw: mappedProp ? JSON.parse(JSON.stringify(mappedProp)) : null,
  })

  // Step: resolve contact IDs based on type
  let relatedIds: string[] = []
  if (mappedProp?.type === "relation") {
    relatedIds = (mappedProp.relation ?? []).map((r: any) => r.id).filter(Boolean)
    log("relation_path", { foundIds: relatedIds })
  } else if (mappedProp?.type === "rollup") {
    const rd = mappedProp.rollup
    log("rollup_payload", {
      rollupType: rd?.type,
      function: rd?.function,
      arrayLength: Array.isArray(rd?.array) ? rd.array.length : null,
      firstItemType: Array.isArray(rd?.array) ? rd.array[0]?.type : null,
      firstItemSample: Array.isArray(rd?.array) ? rd.array[0] : null,
    })
    // 2-hop attempt (read directly from rollup.array)
    if (rd?.type === "array" && Array.isArray(rd.array)) {
      for (const item of rd.array) {
        if (item?.type === "relation" && Array.isArray(item.relation)) {
          for (const r of item.relation) {
            if (r?.id) relatedIds.push(r.id)
          }
        }
      }
      relatedIds = Array.from(new Set(relatedIds))
      log("rollup_2hop_result", { foundIds: relatedIds })
    }
    // 1-hop fallback
    if (relatedIds.length === 0) {
      try {
        const dbInfo: any = await client.databases.retrieve({ database_id: conn.databaseId })
        const schemaProp = dbInfo?.properties?.[fieldName]
        const sourceRelName = schemaProp?.rollup?.relation_property_name
        const rollupPropName = schemaProp?.rollup?.rollup_property_name
        log("rollup_1hop_schema", { sourceRelName, rollupPropName })
        if (sourceRelName) {
          const sourceProp = props[sourceRelName]
          log("rollup_1hop_source_prop", {
            type: sourceProp?.type,
            sample: sourceProp ? JSON.parse(JSON.stringify(sourceProp)) : null,
          })
          if (sourceProp?.type === "relation") {
            relatedIds = (sourceProp.relation ?? []).map((r: any) => r.id).filter(Boolean)
          }
        }
      } catch (e) {
        log("rollup_1hop_error", { error: String(e) })
      }
    }
  } else {
    log("unsupported_type", { type: mappedProp?.type ?? null })
  }

  if (relatedIds.length === 0) {
    return NextResponse.json({ trace, error: "Nenhum contact ID resolvido. Veja o trace pra entender o motivo." })
  }

  // Step: walk each contact and snapshot the page title + every phone-typed field
  const contacts: any[] = []
  for (const cid of relatedIds) {
    try {
      const cp: any = await client.pages.retrieve({ page_id: cid })
      const cProps = cp.properties ?? {}
      let title: string | null = null
      for (const v of Object.values(cProps)) {
        if ((v as any)?.type === "title") {
          title = (v as any).title.map((t: any) => t.plain_text ?? "").join("").trim() || null
          break
        }
      }
      const phoneFields: any[] = []
      for (const [pName, pVal] of Object.entries(cProps)) {
        const t = (pVal as any)?.type
        if (t === "phone_number") {
          phoneFields.push({ name: pName, type: "phone_number", value: (pVal as any).phone_number })
        } else if (typeof (pVal as any).rich_text !== "undefined" && /whatsapp|telefone|celular|phone|mobile/i.test(pName)) {
          const text = ((pVal as any).rich_text ?? []).map((r: any) => r.plain_text ?? "").join("").trim()
          if (text) phoneFields.push({ name: pName, type: "rich_text(named)", value: text })
        }
      }
      // Approver checkbox if configured
      let approverChecked: boolean | null = null
      if (m.contactApproverField) {
        const v = cProps[m.contactApproverField]
        approverChecked = v?.type === "checkbox" ? !!v.checkbox : null
      }
      contacts.push({
        id: cid,
        title,
        approverField: m.contactApproverField ?? null,
        approverChecked,
        phoneFields,
      })
    } catch (e) {
      contacts.push({ id: cid, error: String(e) })
    }
  }

  log("contacts_walked", { count: contacts.length })

  // Pick which contact would be used: approver-checkbox winner OR first
  let pickedContactId: string | null = null
  let pickedReason: string | null = null
  if (m.contactApproverField) {
    const approver = contacts.find((c) => c.approverChecked === true)
    if (approver) {
      pickedContactId = approver.id
      pickedReason = `contactApproverField="${m.contactApproverField}" marcado neste contato`
    } else {
      pickedContactId = contacts[0]?.id ?? null
      pickedReason = `nenhum contato com "${m.contactApproverField}" marcado — usa o primeiro`
    }
  } else {
    pickedContactId = contacts[0]?.id ?? null
    pickedReason = "sem contactApproverField — usa o primeiro contato"
  }

  // Pick which phone would be used (priority: explicit mapping > WhatsApp-named phone > any phone > rich_text fallback)
  const pickedContact = contacts.find((c) => c.id === pickedContactId)
  let pickedPhone: { value: string; source: string } | null = null
  if (pickedContact?.phoneFields) {
    const fields = pickedContact.phoneFields as any[]
    if (m.contactPhoneField) {
      const f = fields.find((x) => x.name === m.contactPhoneField)
      if (f) pickedPhone = { value: f.value, source: `explicit mapping "${m.contactPhoneField}"` }
    }
    if (!pickedPhone) {
      const f = fields.find((x) => x.type === "phone_number" && /whatsapp|whats|wa|telefone|celular|phone|mobile/i.test(x.name))
      if (f) pickedPhone = { value: f.value, source: `whatsapp-named phone_number "${f.name}"` }
    }
    if (!pickedPhone) {
      const f = fields.find((x) => x.type === "phone_number")
      if (f) pickedPhone = { value: f.value, source: `first phone_number "${f.name}"` }
    }
    if (!pickedPhone) {
      const f = fields.find((x) => x.type === "rich_text(named)")
      if (f) pickedPhone = { value: f.value, source: `named rich_text "${f.name}"` }
    }
  }

  return NextResponse.json({
    postId,
    contactField: fieldName,
    contactFieldType: mappedProp?.type ?? null,
    resolvedContactIds: relatedIds,
    contacts,
    pickedContact: pickedContact ? { id: pickedContact.id, title: pickedContact.title } : null,
    pickedReason,
    pickedPhone,
    trace,
  })
}
