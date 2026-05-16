import { Client } from "@notionhq/client"

// ─── Publish targets ───────────────────────────────────────

export interface PublishTarget {
  platform: string  // "instagram" | "facebook" | "youtube" | "tiktok" | "linkedin"
  tipo: string      // "feed" | "carrossel" | "reel" | "story" | "youtube" | "youtube short"
  raw: string       // valor original do Notion (ex.: "Instagram Reels")
}

export const PUBLISH_OPTIONS = [
  { raw: "Instagram Feed",      platform: "instagram", tipo: "feed" },
  { raw: "Instagram Carrossel", platform: "instagram", tipo: "carrossel" },
  { raw: "Instagram Reels",     platform: "instagram", tipo: "reel" },
  { raw: "Instagram Story",     platform: "instagram", tipo: "story" },
  { raw: "Facebook",            platform: "facebook",  tipo: "feed" },
  { raw: "YouTube",             platform: "youtube",   tipo: "youtube" },
  { raw: "YouTube Shorts",      platform: "youtube",   tipo: "youtube short" },
  { raw: "TikTok",              platform: "tiktok",    tipo: "feed" },
  { raw: "LinkedIn",            platform: "linkedin",  tipo: "feed" },
] as const

export function parsePublishTarget(value: string): PublishTarget | null {
  const v = value.toLowerCase().trim()
  if (v === "instagram feed" || v === "instagram post") return { platform: "instagram", tipo: "feed", raw: value }
  if (v === "instagram carrossel" || v === "instagram carousel") return { platform: "instagram", tipo: "carrossel", raw: value }
  if (v === "instagram reels" || v === "instagram reel") return { platform: "instagram", tipo: "reel", raw: value }
  if (v === "instagram story" || v === "instagram stories") return { platform: "instagram", tipo: "story", raw: value }
  if (v === "facebook") return { platform: "facebook", tipo: "feed", raw: value }
  if (v === "youtube" || v === "youtube long") return { platform: "youtube", tipo: "youtube", raw: value }
  if (v === "youtube shorts" || v === "youtube short") return { platform: "youtube", tipo: "youtube short", raw: value }
  if (v === "tiktok") return { platform: "tiktok", tipo: "feed", raw: value }
  if (v === "linkedin") return { platform: "linkedin", tipo: "feed", raw: value }
  return null
}

export interface NotionPost {
  pageId: string
  title: string
  conta: string
  caption: string
  publishTargets: PublishTarget[]
  // Mídias
  verticalUrls: string[]     // 9:16 → Reels, Stories, YouTube Shorts
  horizontalUrls: string[]   // 16:9 → YouTube
  feedImageUrls: string[]    // 1:1 ou 4:5 → Feed e Carrossel
  thumbnailUrl: string | null // capa do Reel / YouTube
  // Preview externo (YouTube unlisted, Drive, Vimeo) usado quando agência
  // ainda não fez o upload do arquivo final mas quer que o cliente
  // aprove o conteúdo em si. Lê de campos URL chamados "Preview Vertical"
  // / "Preview Horizontal" (ou variações: "preview" + orientação). É
  // separado de verticalUrls/horizontalUrls porque não vai pro publish —
  // é só pra exibir no /c/[token].
  previewVerticalUrl: string | null
  previewHorizontalUrl: string | null
  // Defensive catch-all: URLs de QUALQUER campo file-type não mapeado.
  // Quando o workspace usa nomes diferentes ("Capa" vs "Thumbnail",
  // "Imagem" vs "Imagens Feed"), os campos mapeados ficam vazios e o
  // cliente abre o /c/[token] sem mídia pra aprovar. Este fallback evita
  // isso varrendo todos os file-type props da página.
  allMediaUrls: string[]
  scheduledDate: string | null
  // Caption final usada nas publicações (hashtags entram direto na legenda)
  fullCaption: string
  notionUrl: string
  socialVpUrl: string | null
  // Notion status value at fetch time. Reads from approvalStatusField
  // when set (workspaces that split production from publishing), else
  // statusField. Exposed in /scheduled so the agency can see WHICH
  // approval-related state each post is in without clicking through.
  notionStatus: string | null
}

export interface FieldMapping {
  titleField: string
  captionField: string
  publicarEmField: string
  mediaVerticalField: string
  mediaHorizontalField: string
  mediaFeedField: string
  thumbnailField: string
  statusField: string
  statusReadyValue: string
  statusPublishedValue: string
  statusErrorValue: string
  dateField: string
  accountField: string
  likesField?: string | null
  commentsField?: string | null
  reachField?: string | null
  savesField?: string | null
  impressionsField?: string | null
  socialVpField?: string | null
  postUrlField?: string | null
  // Approval flow (optional, opt-in). When awaitingApprovalValue is set,
  // the cron detects posts in that status and notifies the client. See
  // schema.ts comment for the full flow.
  awaitingApprovalValue?: string | null
  // Value written to approvalStatusField when client approves. When set
  // alongside approvalStatusField, markReady flips ONLY that property —
  // the publish status (statusField) stays untouched so scheduling
  // remains a separate, agency-controlled beat.
  approvedValue?: string | null
  revisionRequestedValue?: string | null
  // When approval state lives in a different Notion select than the
  // publish status (e.g. "Status produção" vs "Status agendamento"),
  // this names the property the cron should filter on. Falls back to
  // `statusField` when null/empty.
  approvalStatusField?: string | null
  clientContactField?: string | null
  contactEmailField?: string | null
  contactPhoneField?: string | null
  // Optional: name of a Checkbox property on the Contato DB. When a post
  // links multiple Contato pages, resolveContact prefers the one(s) with
  // this box checked. Empty/missing falls back to "first contact wins".
  contactApproverField?: string | null
  // 2-hop rollup hybrid setting (see schema for full context).
  rollupFallbackToAccount?: boolean | null
}

export const DEFAULT_MAPPING: FieldMapping = {
  titleField: "Produção",
  captionField: "Legenda",
  publicarEmField: "Publicar em",
  mediaVerticalField: "Mídia Vertical",
  mediaHorizontalField: "Mídia Horizontal",
  mediaFeedField: "Imagens Feed",
  thumbnailField: "Thumbnail",
  statusField: "Status",
  statusReadyValue: "Agendamento",
  statusPublishedValue: "Publicado",
  statusErrorValue: "Erro",
  dateField: "Dia para fazer",
  accountField: "Conta",
  socialVpField: "Social VP",
  postUrlField: "Links Publicados",
}

// ─── Cliente Notion ────────────────────────────────────────

export function createNotionClient(accessToken: string) {
  const client = new Client({ auth: accessToken })

  return {
    async getReadyPosts(databaseId: string, mapping: FieldMapping): Promise<NotionPost[]> {
      const now = new Date().toISOString()

      const response = await client.databases.query({
        database_id: databaseId,
        filter: {
          and: [
            {
              property: mapping.statusField,
              status: { equals: mapping.statusReadyValue },
            },
            {
              property: mapping.dateField,
              date: { on_or_before: now },
            },
          ],
        },
        sorts: [{ property: mapping.dateField, direction: "ascending" }],
      })

      const pages = response.results.filter(
        (p): p is typeof p & { properties: Record<string, unknown> } => "properties" in p
      )
      return Promise.all(pages.map((page) => parsePage(page as any, mapping, client)))
    },

    async getScheduledPosts(databaseId: string, mapping: FieldMapping): Promise<NotionPost[]> {
      const response = await client.databases.query({
        database_id: databaseId,
        filter: {
          property: mapping.statusField,
          status: { equals: mapping.statusReadyValue },
        },
        sorts: [{ property: mapping.dateField, direction: "ascending" }],
      })

      const pages = response.results.filter(
        (p): p is typeof p & { properties: Record<string, unknown> } => "properties" in p
      )
      return Promise.all(pages.map((page) => parsePage(page as any, mapping, client)))
    },

    async markPublished(pageId: string, mapping: FieldMapping): Promise<void> {
      await client.pages.update({
        page_id: pageId,
        properties: {
          [mapping.statusField]: { status: { name: mapping.statusPublishedValue } },
        },
      })
    },

    async markFailed(pageId: string, mapping: FieldMapping): Promise<void> {
      await client.pages.update({
        page_id: pageId,
        properties: {
          [mapping.statusField]: { status: { name: mapping.statusErrorValue } },
        },
      })
    },

    async markReady(pageId: string, mapping: FieldMapping): Promise<void> {
      // Reset a previously-failed post back to "Agendado" so the cron can
      // pick it up on the next tick. Used by the manual retry button in
      // /scheduled — publish status flip is intended here.
      await client.pages.update({
        page_id: pageId,
        properties: {
          [mapping.statusField]: { status: { name: mapping.statusReadyValue } },
        },
      })
    },

    async markApproved(pageId: string, mapping: FieldMapping): Promise<void> {
      // Client-approval flip. Two regimes:
      //
      //   New (when approvalStatusField + approvedValue are set):
      //     Approve only flips the APPROVAL property to approvedValue.
      //     Publish status (statusField) stays untouched — the agency
      //     decides scheduling separately. User asked for this in 2026-05.
      //
      //   Legacy (when no approvedValue configured):
      //     Approve flips statusField → statusReadyValue, same as markReady.
      //     The post becomes immediately publishable, matching the old
      //     coupled behavior.
      //
      // Like markRevision (PR #41) we try `status` then `select` for the
      // property type — works whether the agency uses Notion's Status
      // type or a plain Select for their approval column.
      if (mapping.approvalStatusField?.trim() && mapping.approvedValue?.trim()) {
        const targetField = mapping.approvalStatusField.trim()
        const value = mapping.approvedValue.trim()
        try {
          await client.pages.update({
            page_id: pageId,
            properties: { [targetField]: { status: { name: value } } },
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (/status|property.*type|validation/i.test(msg)) {
            await client.pages.update({
              page_id: pageId,
              properties: { [targetField]: { select: { name: value } } },
            })
          } else {
            throw e
          }
        }
        return
      }
      // Legacy fallback — couple approval to publish (old behavior).
      await client.pages.update({
        page_id: pageId,
        properties: {
          [mapping.statusField]: { status: { name: mapping.statusReadyValue } },
        },
      })
    },

    async markRevision(pageId: string, mapping: FieldMapping): Promise<void> {
      // Flip status to revisionRequestedValue ("Em Revisão" by convention)
      // when the client requests changes via /approve/{token}. Caller must
      // ensure mapping.revisionRequestedValue is set.
      //
      // Writes to mapping.approvalStatusField when configured (workspaces
      // that keep the approval flow in a separate Notion property like
      // "Status produção"); falls back to mapping.statusField otherwise.
      if (!mapping.revisionRequestedValue) {
        throw new Error("revisionRequestedValue not configured in field mapping")
      }
      const targetField = mapping.approvalStatusField?.trim() || mapping.statusField
      // Same status-vs-select fallback as getPostsByStatus — write the
      // value with the right shape for the property type.
      try {
        await client.pages.update({
          page_id: pageId,
          properties: {
            [targetField]: { status: { name: mapping.revisionRequestedValue } },
          },
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/status|property.*type|validation/i.test(msg)) {
          await client.pages.update({
            page_id: pageId,
            properties: {
              [targetField]: { select: { name: mapping.revisionRequestedValue } },
            },
          })
        } else {
          throw e
        }
      }
    },

    async addClientComment(pageId: string, text: string, contactName?: string | null): Promise<void> {
      // Posts a comment block on the Notion page. Used when client requests
      // changes or rejects via /approve/{token} — the agency sees the
      // comment in the Notion sidebar exactly like any human comment.
      // Prefixed with the contact name so it's clear who wrote it.
      const prefix = contactName ? `[${contactName}] ` : "[Cliente] "
      await client.comments.create({
        parent: { page_id: pageId },
        rich_text: [{ type: "text", text: { content: prefix + text } }],
      } as any)
    },

    async postSystemComment(pageId: string, text: string): Promise<void> {
      // System-generated audit comment — no contact prefix. Used for
      // "Aprovação solicitada", "Aprovado por X", etc. so the post's
      // Notion sidebar carries a timeline of every approval event.
      // Soft-fails: if the integration lacks comment access on the page,
      // we log and move on rather than break the publish loop.
      try {
        await client.comments.create({
          parent: { page_id: pageId },
          rich_text: [{ type: "text", text: { content: text } }],
        } as any)
      } catch (e) {
        console.warn(`[notion.postSystemComment] page ${pageId}: ${e instanceof Error ? e.message : e}`)
      }
    },

    async listComments(pageId: string): Promise<Array<{
      id: string
      text: string
      createdTime: string
      // Heurística: comentários do nosso fluxo seguem padrão "[Nome] ..."
      // (cliente via /approve), "✓ Aprovado por ..." / "🔁 Pedido ..." (audit).
      // Qualquer outra coisa veio digitado direto no Notion pela agency.
      kind: "client" | "agency" | "system"
      // Quando kind='client', nome dentro do "[...]" pra exibir no header.
      authorLabel: string | null
    }>> {
      try {
        const all: Array<any> = []
        let cursor: string | undefined = undefined
        do {
          const res: any = await client.comments.list({
            block_id: pageId,
            start_cursor: cursor,
            page_size: 100,
          })
          all.push(...res.results)
          cursor = res.has_more ? res.next_cursor : undefined
        } while (cursor)

        return all
          .map((c: any) => {
            const text = (c.rich_text ?? [])
              .map((rt: any) => rt.plain_text ?? "")
              .join("")
            const trimmed = text.trim()
            let kind: "client" | "agency" | "system" = "agency"
            let authorLabel: string | null = null
            let displayText = trimmed

            // Audit/system msgs começam com emoji marker que postSystemComment
            // gera: "✓ Aprovado por X · ...", "🔁 Pedido alterações ...",
            // "⏰ Aprovação automática ..." e variações.
            if (/^[✓🔁⏰⚠✅❌]/.test(trimmed)) {
              kind = "system"
            } else {
              // Padrão "[Nome] mensagem" vem do addClientComment.
              const m = trimmed.match(/^\[([^\]]+)\]\s*([\s\S]*)$/)
              if (m) {
                kind = "client"
                authorLabel = m[1].trim()
                displayText = m[2].trim()
              }
              // Outros (sem prefixo) = digitado direto na sidebar do Notion.
            }

            return {
              id: c.id,
              text: displayText,
              createdTime: c.created_time,
              kind,
              authorLabel,
            }
          })
          .filter((c) => c.text.length > 0)
          .sort((a, b) => a.createdTime.localeCompare(b.createdTime))
      } catch (e) {
        console.warn(`[notion.listComments] page ${pageId}: ${e instanceof Error ? e.message : e}`)
        return []
      }
    },

    async getPostsByStatus(databaseId: string, mapping: FieldMapping, statusValue: string): Promise<NotionPost[]> {
      // Generic by-status query. Used for the approval-pending sweep
      // (statusValue = mapping.awaitingApprovalValue). Filters on the
      // approval-specific property when configured (workspaces with a
      // separate "Status produção" column), otherwise the publish status
      // field. No date filter — pending approval can sit there as long
      // as the cycle takes.
      //
      // Property can be Notion's `status` type (the state-machine one) or
      // a plain `select`. Try status first; if Notion rejects with a
      // validation error we retry with the select filter shape.
      const property = mapping.approvalStatusField?.trim() || mapping.statusField
      let response
      try {
        response = await client.databases.query({
          database_id: databaseId,
          filter: { property, status: { equals: statusValue } },
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/status|property.*type|validation/i.test(msg)) {
          response = await client.databases.query({
            database_id: databaseId,
            filter: { property, select: { equals: statusValue } },
          })
        } else {
          throw e
        }
      }
      const pages = response.results.filter(
        (p): p is typeof p & { properties: Record<string, unknown> } => "properties" in p
      )
      return Promise.all(pages.map((page) => parsePage(page as any, mapping, client)))
    },

    async resolveContact(pageId: string, mapping: FieldMapping): Promise<{
      name: string | null
      email: string | null
      phone: string | null
      // True when the relation linked >1 contact pages — we use the first.
      // Surfaced in test/Histórico UI so agency knows other links were ignored.
      multipleContacts?: boolean
    } | null> {
      // Walk: post → relation property (clientContactField) → first related
      // Contato page → read email/phone/title.
      //
      // Return semantics:
      //   null           — relation not configured, post not found, relation
      //                    empty, or related page missing. Cron skips entirely.
      //   { …, email/phone all null }
      //                  — contact row was found but has no usable contact
      //                    info. Cron logs the specific case so agency can
      //                    fix the Contato page (vs blank relation case).
      //   { …, email/phone present }
      //                  — happy path.
      //   multipleContacts: true
      //                  — relation linked multiple Contato rows; we used
      //                    the first. Surface in UI as a warning.
      // Only the relation field is required. Email is optional (legacy:
      // it used to be required when we still sent fallback approval emails;
      // now WhatsApp-only flow doesn't need it). Phone is configured
      // separately and checked inside the body.
      if (!mapping.clientContactField) return null
      try {
        const page = await client.pages.retrieve({ page_id: pageId })
        if (!("properties" in page)) return null
        const props = (page as any).properties
        const fieldName = mapping.clientContactField
        const mappedProp = props[fieldName]
        // Resolve related-contact IDs from either a Relation or a Rollup
        // that aggregates a Relation. Notion's rollup payload on a page
        // doesn't expose the relation values directly — for that we need
        // the underlying relation_property_name from the DB schema, then
        // re-read the page property under that name. We do this lazily
        // so non-rollup paths skip the extra fetch.
        let relatedIds: string[] = []
        if (mappedProp?.type === "relation") {
          relatedIds = mappedProp.relation?.map((r: any) => r.id) ?? []
        } else if (mappedProp?.type === "rollup") {
          // Track whether the rollup payload is a relation-rollup so we
          // know not to fall back to 1-hop on an empty result. If the
          // user has it set up correctly as 2-hop (Post → Conta → Contatos)
          // and the Conta has zero linked contacts, the right answer is
          // "no contacts" — NOT "use the Conta page as a contact".
          let rollupIsRelationShape = false
          const rollupData = mappedProp.rollup
          if (rollupData?.type === "array" && Array.isArray(rollupData.array)) {
            for (const item of rollupData.array) {
              if (item?.type === "relation") {
                rollupIsRelationShape = true
                if (Array.isArray(item.relation)) {
                  for (const r of item.relation) {
                    if (r?.id) relatedIds.push(r.id)
                  }
                }
              }
            }
            if (relatedIds.length > 1) {
              relatedIds = Array.from(new Set(relatedIds))
            }
          }
          // 1-hop fallback: ONLY for rollups whose array isn't already
          // shaped as relations. The legacy case was a rollup of a
          // same-page relation (rare config) where rollup.array might
          // be empty/different. For the common case where rollupItems
          // are typed 'relation' but happen to be empty (Conta with no
          // Contatos linked yet), we must NOT walk back to the source
          // relation — that would treat the linked Conta page as a
          // contact and read its phone. User reported this bug in
          // 2026-05-12; trace showed exactly this misfire.
          if (relatedIds.length === 0 && !rollupIsRelationShape) try {
            const parentDbId = (page as any).parent?.database_id
            if (parentDbId) {
              const dbInfo: any = await client.databases.retrieve({ database_id: parentDbId })
              const schemaProp = dbInfo?.properties?.[fieldName]
              const sourceRelName: string | undefined = schemaProp?.rollup?.relation_property_name
              if (sourceRelName) {
                const sourceProp = props[sourceRelName]
                if (sourceProp?.type === "relation") {
                  relatedIds = sourceProp.relation?.map((r: any) => r.id) ?? []
                }
              }
            }
          } catch (e) {
            console.warn(`[notion.resolveContact] rollup ${fieldName} fallback schema lookup failed: ${e}`)
          }
          if (relatedIds.length === 0 && rollupIsRelationShape && mapping.rollupFallbackToAccount) try {
            // Hybrid fallback (opt-in): rollup is empty (no Contatos
            // linked on the Conta), so use the Conta page itself as
            // the contact. Reads phone from a phone-typed field on
            // the Conta. Agencies enable this in /settings when they
            // store phones directly on Conta pages.
            const parentDbId = (page as any).parent?.database_id
            if (parentDbId) {
              const dbInfo: any = await client.databases.retrieve({ database_id: parentDbId })
              const schemaProp = dbInfo?.properties?.[fieldName]
              const sourceRelName: string | undefined = schemaProp?.rollup?.relation_property_name
              if (sourceRelName) {
                const sourceProp = props[sourceRelName]
                if (sourceProp?.type === "relation") {
                  relatedIds = sourceProp.relation?.map((r: any) => r.id) ?? []
                  console.info(`[notion.resolveContact] post ${pageId}: rollup empty, falling back to Conta page (${sourceRelName}) — ${relatedIds.length} ID(s)`)
                }
              }
            }
          } catch (e) {
            console.warn(`[notion.resolveContact] rollup→account fallback failed for ${fieldName}: ${e}`)
          }
          if (relatedIds.length === 0 && rollupIsRelationShape) {
            console.warn(`[notion.resolveContact] post ${pageId}: rollup "${fieldName}" returned 0 contacts. ${mapping.rollupFallbackToAccount ? "Conta page also yielded nothing." : "Either link contacts on the Conta page in Notion, or enable 'Usar Conta como fallback' in /settings."}`)
          }
        }
        if (relatedIds.length === 0) return null

        // Multi-contact case: if mapping.contactApproverField is set, fetch
        // each linked contact in parallel and pick the first one whose
        // checkbox is marked. When no checkbox is marked (or the field
        // isn't configured), fall back to "first contact wins" — the
        // legacy behavior.
        let targetId = relatedIds[0]
        const multipleContacts = relatedIds.length > 1
        let contactPage: any = null

        if (multipleContacts && mapping.contactApproverField) {
          // Fetch all related contacts so we can scan their approver flag.
          // Sequential fetch keeps it simple and bounded — typical N=2-3.
          const fetched = await Promise.allSettled(
            relatedIds.map((id) => client.pages.retrieve({ page_id: id })),
          )
          const pages = fetched
            .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
            .map((r) => r.value)
            .filter((p) => "properties" in p)
          const approver = pages.find((p) => {
            const v = p.properties?.[mapping.contactApproverField!]
            return v?.type === "checkbox" && v.checkbox === true
          })
          if (approver) {
            targetId = approver.id
            contactPage = approver
          } else {
            console.warn(
              `[notion.resolveContact] post ${pageId} has ${relatedIds.length} linked contacts but none with "${mapping.contactApproverField}" checked; falling back to first (${targetId})`,
            )
          }
        } else if (multipleContacts) {
          console.warn(
            `[notion.resolveContact] post ${pageId} has ${relatedIds.length} linked contacts; using first (${targetId}). Configure "Coluna 'Aprovador?' (na DB Contato)" pra escolher entre eles.`,
          )
        }

        if (!contactPage) {
          contactPage = await client.pages.retrieve({ page_id: targetId })
        }
        if (!("properties" in contactPage)) return null
        const cp = (contactPage as any).properties

        // Find the title property on the contact page (Notion calls this
        // type "title" — there's exactly one per DB but the name varies).
        let name: string | null = null
        for (const v of Object.values(cp)) {
          if ((v as any)?.type === "title") {
            const arr = (v as any).title as Array<{ plain_text?: string }>
            name = arr.map((t) => t.plain_text ?? "").join("").trim() || null
            break
          }
        }

        const emailVal = mapping.contactEmailField
          ? readContactProp(cp[mapping.contactEmailField])
          : null

        // Phone resolution priority (most specific → least):
        //   1. Explicit mapping (legacy `contactPhoneField`).
        //   2. WhatsApp-named phone_number property — "Celular / WhatsApp",
        //      "WhatsApp", etc. A contact page often has multiple phone
        //      fields (escritório, pessoal, etc.); the one named for
        //      WhatsApp should win over "first phone_number found".
        //   3. Any phone_number-type property (fallback when no name hints).
        //   4. Name-only heuristic on any property type (catches
        //      workspaces that stored phones as rich_text).
        const phoneNamePattern = /\b(whatsapp|whats|wa|telefone|celular|phone|mobile)\b/i
        let phoneVal: string | null = null
        let phoneSource: string | null = null
        if (mapping.contactPhoneField) {
          phoneVal = readContactProp(cp[mapping.contactPhoneField])
          if (phoneVal) phoneSource = mapping.contactPhoneField
        }
        if (!phoneVal) {
          // Pass 1: phone_number type with WhatsApp-related name.
          for (const [propName, v] of Object.entries(cp)) {
            if ((v as any)?.type !== "phone_number") continue
            if (!phoneNamePattern.test(propName)) continue
            const candidate = typeof (v as any).phone_number === "string"
              ? (v as any).phone_number.trim() || null
              : null
            if (candidate) { phoneVal = candidate; phoneSource = propName; break }
          }
        }
        if (!phoneVal) {
          // Pass 2: any phone_number type, even without a name hint.
          for (const [propName, v] of Object.entries(cp)) {
            if ((v as any)?.type !== "phone_number") continue
            const candidate = typeof (v as any).phone_number === "string"
              ? (v as any).phone_number.trim() || null
              : null
            if (candidate) { phoneVal = candidate; phoneSource = propName; break }
          }
        }
        if (!phoneVal) {
          // Pass 3: name-only — catches workspaces that stored phones
          // as rich_text instead of the typed column.
          for (const [propName, v] of Object.entries(cp)) {
            if (!phoneNamePattern.test(propName)) continue
            const candidate = readContactProp(v)
            if (candidate) { phoneVal = candidate; phoneSource = propName; break }
          }
        }
        if (phoneVal && phoneSource) {
          console.info(`[notion.resolveContact] post ${pageId} → contact ${targetId} → phone from "${phoneSource}"`)
        }

        return { name, email: emailVal, phone: phoneVal, multipleContacts }
      } catch (e) {
        console.warn(`[notion.resolveContact] failed for ${pageId}: ${e}`)
        return null
      }
    },

    async getPostById(pageId: string, mapping: FieldMapping): Promise<NotionPost | null> {
      // One-shot fetch of a single page. Used by the Preview dialog on past
      // posts where we don't have the original media URLs cached in publishLog.
      try {
        const page = await client.pages.retrieve({ page_id: pageId })
        if (!("properties" in page)) return null
        return await parsePage(page as any, mapping, client)
      } catch {
        return null
      }
    },

    async updateAnalytics(
      pageId: string,
      mapping: FieldMapping,
      metrics: { likes: number | null; comments: number | null; reach: number | null; saves: number | null; impressions: number | null }
    ): Promise<void> {
      const properties: Record<string, unknown> = {}
      if (mapping.likesField && metrics.likes !== null) properties[mapping.likesField] = { number: metrics.likes }
      if (mapping.commentsField && metrics.comments !== null) properties[mapping.commentsField] = { number: metrics.comments }
      if (mapping.reachField && metrics.reach !== null) properties[mapping.reachField] = { number: metrics.reach }
      if (mapping.savesField && metrics.saves !== null) properties[mapping.savesField] = { number: metrics.saves }
      if (mapping.impressionsField && metrics.impressions !== null) properties[mapping.impressionsField] = { number: metrics.impressions }

      if (Object.keys(properties).length === 0) return
      await client.pages.update({ page_id: pageId, properties: properties as any })
    },

    async setSocialVpUrl(pageId: string, mapping: FieldMapping, url: string): Promise<void> {
      if (!mapping.socialVpField) return
      try {
        await client.pages.update({
          page_id: pageId,
          properties: {
            [mapping.socialVpField]: { url },
          } as any,
        })
      } catch {
        // Field may not exist on the user's database — fail silently
      }
    },

    async setPostUrl(pageId: string, mapping: FieldMapping, url: string): Promise<void> {
      // Backwards-compat shim: writes a single URL via setPostUrls.
      return this.setPostUrls(pageId, mapping, [{ platform: "Post", url }])
    },

    async setPostUrls(
      pageId: string,
      mapping: FieldMapping,
      links: Array<{ platform: string; url: string }>
    ): Promise<void> {
      if (!mapping.postUrlField || !links.length) return
      // Build a rich_text array: "Platform: " + clickable URL, separated by newlines.
      const richText: Array<Record<string, unknown>> = []
      links.forEach((link, i) => {
        if (i > 0) richText.push({ type: "text", text: { content: "\n" } })
        richText.push({ type: "text", text: { content: `${link.platform}: ` } })
        richText.push({
          type: "text",
          text: { content: link.url, link: { url: link.url } },
        })
      })
      try {
        await client.pages.update({
          page_id: pageId,
          properties: {
            [mapping.postUrlField]: { rich_text: richText },
          } as any,
        })
      } catch (e) {
        // The property may not exist, or may be the wrong type (e.g. URL
        // property instead of rich_text). Don't fail the publish — just log.
        console.warn(`[notion.setPostUrls] failed for page ${pageId}: ${e}`)
      }
    },

    /**
     * List the available `conta` values from this database's accountField.
     * Used by /api/clients/[id]/notion-contas to populate the multi-select
     * in client settings, so the agency can declare which Notion conta
     * values belong to this client without typing them by hand.
     *
     * Behavior depends on the property type:
     *   - select / status / multi_select → reads schema options
     *   - relation → queries the related database and returns its page titles
     *   - rich_text / title → scans recent pages and dedupes distinct values
     *
     * Returns up to 100 distinct values.
     */
    async listAccountFieldOptions(databaseId: string, fieldName: string): Promise<string[]> {
      try {
        const dbInfo = (await client.databases.retrieve({ database_id: databaseId })) as any
        const prop = dbInfo.properties?.[fieldName]
        if (!prop) return []

        if (prop.type === "select" && Array.isArray(prop.select?.options)) {
          return prop.select.options.map((o: any) => o.name).filter(Boolean)
        }
        if (prop.type === "status" && Array.isArray(prop.status?.options)) {
          return prop.status.options.map((o: any) => o.name).filter(Boolean)
        }
        if (prop.type === "multi_select" && Array.isArray(prop.multi_select?.options)) {
          return prop.multi_select.options.map((o: any) => o.name).filter(Boolean)
        }
        if (prop.type === "relation" && prop.relation?.database_id) {
          // Pull up to 100 pages from the related database and return their
          // titles. Cheap because relation databases are usually small
          // (Contas / Marcas / Clients tables).
          const related = await client.databases.query({
            database_id: prop.relation.database_id,
            page_size: 100,
          })
          return related.results
            .map((page: any) => {
              const titleProp = Object.values(page.properties ?? {}).find((p: any) => p.type === "title") as any
              return (titleProp?.title ?? []).map((t: any) => t.plain_text ?? "").join("")
            })
            .filter((s: string) => s.length > 0)
        }
        if (prop.type === "rich_text" || prop.type === "title") {
          // Scan recent pages and dedupe — bounded to 100 pages.
          const pages = await client.databases.query({
            database_id: databaseId,
            page_size: 100,
          })
          const seen = new Set<string>()
          for (const page of pages.results as any[]) {
            const propVal = page.properties?.[fieldName]
            const text = (propVal?.[prop.type] ?? [])
              .map((t: any) => t.plain_text ?? "")
              .join("")
            if (text) seen.add(text)
          }
          return Array.from(seen)
        }
        return []
      } catch (e) {
        console.warn(`[notion.listAccountFieldOptions] failed for db ${databaseId}: ${e}`)
        return []
      }
    },
  }
}

// ─── Parsing ──────────────────────────────────────────────

async function parsePage(page: any, m: FieldMapping, client: Client): Promise<NotionPost> {
  const p = page.properties
  const caption = getRichText(p[m.captionField], "rich_text")

  const conta = await resolveAccount(p[m.accountField], client)

  const rawTargets = getMultiSelect(p[m.publicarEmField])
  const publishTargets = rawTargets
    .map(parsePublishTarget)
    .filter((t): t is PublishTarget => t !== null)

  // Defensive fallback — quando o "Publicar em" mapeado não bate com o
  // nome real do campo no workspace (ou o cliente esqueceu de preencher),
  // varre TODAS as multi_select/select props da página procurando valores
  // reconhecíveis ("Instagram Carrossel", "YouTube Shorts" etc.). Garante
  // que o /c/[token] consiga renderizar o mockup mesmo sem mapping ideal.
  if (publishTargets.length === 0) {
    for (const [fieldName, prop] of Object.entries(p as Record<string, any>)) {
      if (fieldName === m.publicarEmField) continue
      const values: string[] = []
      if (prop?.type === "multi_select") {
        for (const o of prop.multi_select ?? []) {
          if (o?.name) values.push(o.name)
        }
      } else if (prop?.type === "select" && prop.select?.name) {
        values.push(prop.select.name)
      }
      for (const v of values) {
        const t = parsePublishTarget(v)
        if (t && !publishTargets.find((x) => x.raw === t.raw)) {
          publishTargets.push(t)
        }
      }
    }
  }

  // Read status from approvalStatusField when set, fall back to
  // statusField. Both can be status type or select type, so try
  // both shapes.
  const statusFieldName = m.approvalStatusField?.trim() || m.statusField
  const statusProp = statusFieldName ? p[statusFieldName] : null
  const notionStatus: string | null =
    statusProp?.status?.name ?? statusProp?.select?.name ?? null

  const verticalUrls = getFiles(p[m.mediaVerticalField])
  const horizontalUrls = getFiles(p[m.mediaHorizontalField])
  const feedImageUrls = getFiles(p[m.mediaFeedField])
  const thumbnailUrl = getFiles(p[m.thumbnailField])[0] ?? null

  // Preview links (YouTube unlisted / Drive / Vimeo). Detecta por nome
  // do campo — qualquer prop com "preview" no nome (case-insensitive).
  // Quando "vertical" ou "horizontal" também estiver no nome, separa por
  // orientação; senão usa o mesmo URL pros dois (preview genérico).
  // Property pode ser url, rich_text com link ou rich_text com URL no
  // texto. extractAnyUrl cobre os 3 casos. Como fallback final, se NÃO
  // achamos campo "preview", scan por qualquer URL property que aponte
  // pra YouTube/Vimeo/Drive — agências usam nomes tipo "Link do vídeo".
  let previewVerticalUrl: string | null = null
  let previewHorizontalUrl: string | null = null
  for (const [fieldName, prop] of Object.entries(p as Record<string, any>)) {
    const lower = fieldName.toLowerCase()
    if (!lower.includes("preview")) continue
    const url = extractAnyUrl(prop)
    if (!url) continue
    const hasVertical = lower.includes("vertical")
    const hasHorizontal = lower.includes("horizontal")
    if (hasVertical && !previewVerticalUrl) previewVerticalUrl = url
    if (hasHorizontal && !previewHorizontalUrl) previewHorizontalUrl = url
    if (!hasVertical && !hasHorizontal) {
      // "Preview" genérico — usa pros dois quando ainda não temos
      // específico, sem sobrescrever.
      if (!previewVerticalUrl) previewVerticalUrl = url
      if (!previewHorizontalUrl) previewHorizontalUrl = url
    }
  }
  if (!previewVerticalUrl && !previewHorizontalUrl) {
    for (const prop of Object.values(p as Record<string, any>)) {
      const url = extractAnyUrl(prop)
      if (!url) continue
      if (/(youtube\.com|youtu\.be|vimeo\.com|drive\.google\.com)/i.test(url)) {
        previewVerticalUrl = url
        previewHorizontalUrl = url
        break
      }
    }
  }

  // Defensive fallback — quando mapping não bate com os nomes reais dos
  // campos do workspace, varre TODAS as props file-type da página pra
  // pegar QUALQUER mídia uploadada. Garantia mínima de que o cliente
  // sempre vê algo no /c/[token] sem depender da agency configurar
  // mapping perfeito.
  const mappedFieldNames = new Set(
    [m.mediaVerticalField, m.mediaHorizontalField, m.mediaFeedField, m.thumbnailField].filter(Boolean)
  )
  const allMediaUrls: string[] = []
  for (const [fieldName, prop] of Object.entries(p as Record<string, any>)) {
    if (mappedFieldNames.has(fieldName)) continue
    if (prop?.type !== "files") continue
    for (const url of getFiles(prop)) {
      if (!allMediaUrls.includes(url)) allMediaUrls.push(url)
    }
  }

  return {
    pageId: page.id,
    title: getRichText(p[m.titleField], "title"),
    conta,
    caption,
    publishTargets,
    verticalUrls,
    horizontalUrls,
    feedImageUrls,
    thumbnailUrl,
    previewVerticalUrl,
    previewHorizontalUrl,
    allMediaUrls,
    scheduledDate: getDate(p[m.dateField]),
    fullCaption: caption,
    notionUrl: page.url,
    socialVpUrl: m.socialVpField ? getUrl(p[m.socialVpField]) : null,
    notionStatus,
  }
}

// Extrai a primeira URL plausível de uma property Notion. Cobre o
// formato `url`, `rich_text` com link embutido (rt.text.link.url) e
// `rich_text` cujo plain_text é a URL crua. Retorna trimmed string ou
// null. Usado pra ler campos "Preview Vertical/Horizontal" que podem
// estar configurados como URL property ou como rich text.
function extractAnyUrl(prop: any): string | null {
  if (!prop) return null
  if (typeof prop.url === "string" && prop.url.trim()) return prop.url.trim()
  const arr = prop.rich_text ?? prop.title
  if (Array.isArray(arr)) {
    for (const rt of arr) {
      const linkUrl = rt?.text?.link?.url ?? rt?.href
      if (typeof linkUrl === "string" && linkUrl.trim()) return linkUrl.trim()
    }
    const joined = arr.map((rt: any) => rt?.plain_text ?? "").join(" ").trim()
    const match = joined.match(/https?:\/\/\S+/)
    if (match) return match[0].replace(/[)\].,;]+$/, "")
  }
  return null
}

async function resolveAccount(prop: any, client: Client): Promise<string> {
  if (!prop) return ""

  // select / status
  if (prop.select?.name) return prop.select.name
  if (prop.status?.name) return prop.status.name

  // rich_text or title
  const text = (prop.rich_text ?? prop.title ?? [])
    .map((t: any) => t.plain_text ?? "")
    .join("")
  if (text) return text

  // relation — fetch title of the first related page
  if (prop.type === "relation" && prop.relation?.length > 0) {
    try {
      const related = await client.pages.retrieve({ page_id: prop.relation[0].id }) as any
      const titleProp = Object.values(related.properties ?? {}).find((p: any) => p.type === "title") as any
      return (titleProp?.title ?? []).map((t: any) => t.plain_text ?? "").join("")
    } catch {
      return ""
    }
  }

  return ""
}

function getRichText(prop: any, type: "title" | "rich_text"): string {
  if (!prop) return ""
  return (prop[type] ?? []).map((t: any) => t.plain_text ?? "").join("")
}

function getMultiSelect(prop: any): string[] {
  if (!prop?.multi_select) return []
  return prop.multi_select.map((s: any) => s.name)
}

function getDate(prop: any): string | null {
  return prop?.date?.start ?? null
}

function getUrl(prop: any): string | null {
  return prop?.url ?? null
}

function getFiles(prop: any): string[] {
  if (!prop?.files) return []
  return prop.files
    .map((f: any) =>
      f.type === "external" ? f.external.url : f.file?.url ?? null
    )
    .filter(Boolean)
}

// Reads a contact-info property regardless of how the user typed it in
// Notion. Email property → string. Phone property → string. Rich text
// or title → joined plain text. Rollup → first string-bearing element.
// Returns trimmed non-empty string or null. Used by resolveContact for
// email + phone lookup on Contatos pages.
export function readContactProp(prop: any): string | null {
  if (!prop) return null
  if (typeof prop.email === "string") return prop.email.trim() || null
  if (typeof prop.phone_number === "string") return prop.phone_number.trim() || null
  if (typeof prop.url === "string") return prop.url.trim() || null
  if (Array.isArray(prop.rich_text)) {
    const s = prop.rich_text.map((r: any) => r.plain_text ?? "").join("").trim()
    return s || null
  }
  if (Array.isArray(prop.title)) {
    const s = prop.title.map((r: any) => r.plain_text ?? "").join("").trim()
    return s || null
  }
  if (prop.rollup) {
    const arr = prop.rollup.array as any[] | undefined
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const v = readContactProp(item)
        if (v) return v
      }
    }
    if (typeof prop.rollup.string === "string") return prop.rollup.string.trim() || null
  }
  if (typeof prop.formula?.string === "string") return prop.formula.string.trim() || null
  return null
}
