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
      if (!mapping.revisionRequestedValue) {
        throw new Error("revisionRequestedValue not configured in field mapping")
      }
      await client.pages.update({
        page_id: pageId,
        properties: {
          [mapping.statusField]: { status: { name: mapping.revisionRequestedValue } },
        },
      })
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
      // (statusValue = mapping.awaitingApprovalValue). No date filter —
      // pending approval can sit there as long as the cycle takes.
      const response = await client.databases.query({
        database_id: databaseId,
        filter: {
          property: mapping.statusField,
          status: { equals: statusValue },
        },
      })
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
