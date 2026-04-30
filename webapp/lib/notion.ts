import { Client } from "@notionhq/client"

// ─── Tipos de conteúdo suportados ─────────────────────────────────────────

export type ContentType =
  | "Feed"        // imagem única no feed
  | "Carrossel"   // múltiplas imagens no feed
  | "Reel"        // vídeo vertical (até 90s) — aparece no feed e Reels
  | "Story"       // vídeo ou imagem vertical (some em 24h)
  | "YouTube"     // vídeo horizontal longo
  | "YouTube Short" // vídeo vertical curto (até 60s)

export type Platform = "Instagram" | "Facebook" | "YouTube"

export interface NotionPost {
  pageId: string
  title: string
  conta: string
  caption: string
  hashtags: string
  tipo: ContentType | string
  plataformas: Platform[]
  // Mídias
  verticalUrls: string[]     // 9:16 → Reels, Stories, YouTube Shorts
  horizontalUrls: string[]   // 16:9 → YouTube
  feedImageUrls: string[]    // 1:1 ou 4:5 → Feed e Carrossel
  thumbnailUrl: string | null // capa do Reel / YouTube
  scheduledDate: string | null
  // Campo completo para caption + hashtags
  fullCaption: string
}

export interface FieldMapping {
  titleField: string
  captionField: string
  hashtagsField: string
  tipoField: string
  plataformasField: string
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
}

export const DEFAULT_MAPPING: FieldMapping = {
  titleField: "Produção",
  captionField: "Legenda",
  hashtagsField: "Hashtags",
  tipoField: "Tipo",
  plataformasField: "Plataformas",
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
}

// ─── Cliente Notion ──────────────────────────────────────────────────

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
  }
}

// ─── Parsing ───────────────────────────────────────────────────────────

async function parsePage(page: any, m: FieldMapping, client: Client): Promise<NotionPost> {
  const p = page.properties
  const caption = getRichText(p[m.captionField], "rich_text")
  const hashtags = getRichText(p[m.hashtagsField], "rich_text")

  // Resolve account: supports select, status, rich_text, title, and relation types
  const conta = await resolveAccount(p[m.accountField], client)

  return {
    pageId: page.id,
    title: getRichText(p[m.titleField], "title"),
    conta,
    caption,
    hashtags,
    tipo: getSelect(p[m.tipoField]) || "Feed",
    plataformas: getMultiSelect(p[m.plataformasField]) as Platform[],
    verticalUrls: getFiles(p[m.mediaVerticalField]),
    horizontalUrls: getFiles(p[m.mediaHorizontalField]),
    feedImageUrls: getFiles(p[m.mediaFeedField]),
    thumbnailUrl: getFiles(p[m.thumbnailField])[0] ?? null,
    scheduledDate: getDate(p[m.dateField]),
    fullCaption: [caption, hashtags].filter(Boolean).join("\n\n"),
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

function getSelect(prop: any): string {
  if (!prop) return ""
  return prop.select?.name ?? prop.status?.name ?? ""
}

function getMultiSelect(prop: any): string[] {
  if (!prop?.multi_select) return []
  return prop.multi_select.map((s: any) => s.name)
}

function getDate(prop: any): string | null {
  return prop?.date?.start ?? null
}

function getFiles(prop: any): string[] {
  if (!prop?.files) return []
  return prop.files
    .map((f: any) =>
      f.type === "external" ? f.external.url : f.file?.url ?? null
    )
    .filter(Boolean)
}
