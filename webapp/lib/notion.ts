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
  scheduledDate: string | null
  // Caption final usada nas publicações (hashtags entram direto na legenda)
  fullCaption: string
  notionUrl: string
  socialVpUrl: string | null
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
  revisionRequestedValue?: string | null
  // When approval state lives in a different Notion select than the
  // publish status (e.g. "Status produção" vs "Status agendamento"),
  // this names the property the cron should filter on. Falls back to
  // `statusField` when null/empty.
  approvalStatusField?: string | null
  clientContactField?: string | null
  contactEmailField?: string | null
  contactPhoneField?: string | null
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
      // pick it up on the next tick. Used by the manual retry button in /scheduled.
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
      if (!mapping.clientContactField || !mapping.contactEmailField) return null
      try {
        const page = await client.pages.retrieve({ page_id: pageId })
        if (!("properties" in page)) return null
        const props = (page as any).properties
        const relProp = props[mapping.clientContactField]
        const relatedIds: string[] = relProp?.relation?.map((r: any) => r.id) ?? []
        const targetId = relatedIds[0]
        if (!targetId) return null

        const multipleContacts = relatedIds.length > 1
        if (multipleContacts) {
          console.warn(
            `[notion.resolveContact] post ${pageId} has ${relatedIds.length} linked contacts; using first (${targetId})`
          )
        }

        const contactPage = await client.pages.retrieve({ page_id: targetId })
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

        const emailVal = readContactProp(cp[mapping.contactEmailField])
        const phoneVal = mapping.contactPhoneField
          ? readContactProp(cp[mapping.contactPhoneField])
          : null

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

  return {
    pageId: page.id,
    title: getRichText(p[m.titleField], "title"),
    conta,
    caption,
    publishTargets,
    verticalUrls: getFiles(p[m.mediaVerticalField]),
    horizontalUrls: getFiles(p[m.mediaHorizontalField]),
    feedImageUrls: getFiles(p[m.mediaFeedField]),
    thumbnailUrl: getFiles(p[m.thumbnailField])[0] ?? null,
    scheduledDate: getDate(p[m.dateField]),
    fullCaption: caption,
    notionUrl: page.url,
    socialVpUrl: m.socialVpField ? getUrl(p[m.socialVpField]) : null,
  }
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
