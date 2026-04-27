import { Client } from "@notionhq/client"

export interface NotionPost {
  pageId: string
  title: string
  conta: string
  caption: string
  verticalUrls: string[]
  horizontalUrls: string[]
  scheduledDate: string | null
}

export interface FieldMapping {
  titleField: string
  captionField: string
  mediaVerticalField: string
  mediaHorizontalField: string
  statusField: string
  statusReadyValue: string
  statusPublishedValue: string
  statusErrorValue: string
  dateField: string
  accountField: string
}

export function createNotionClient(accessToken: string) {
  const client = new Client({ auth: accessToken })

  return {
    async getReadyPosts(databaseId: string, mapping: FieldMapping): Promise<NotionPost[]> {
      const response = await client.databases.query({
        database_id: databaseId,
        filter: {
          property: mapping.statusField,
          status: { equals: mapping.statusReadyValue },
        },
        sorts: [{ property: mapping.dateField, direction: "ascending" }],
      })

      return response.results
        .filter((p): p is typeof p & { properties: Record<string, unknown> } => "properties" in p)
        .map((page) => parsePage(page as any, mapping))
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
  }
}

function parsePage(page: any, mapping: FieldMapping): NotionPost {
  const props = page.properties
  return {
    pageId: page.id,
    title: getRichText(props[mapping.titleField], "title"),
    conta: getSelect(props[mapping.accountField]),
    caption: getRichText(props[mapping.captionField], "rich_text"),
    verticalUrls: getFiles(props[mapping.mediaVerticalField]),
    horizontalUrls: getFiles(props[mapping.mediaHorizontalField]),
    scheduledDate: getDate(props[mapping.dateField]),
  }
}

function getRichText(prop: any, type: "title" | "rich_text"): string {
  if (!prop) return ""
  return (prop[type] ?? []).map((t: any) => t.plain_text ?? "").join("")
}

function getSelect(prop: any): string {
  if (!prop) return ""
  return prop.select?.name ?? prop.status?.name ?? ""
}

function getDate(prop: any): string | null {
  return prop?.date?.start ?? null
}

function getFiles(prop: any): string[] {
  if (!prop?.files) return []
  return prop.files
    .map((f: any) => f.type === "external" ? f.external.url : f.file?.url ?? null)
    .filter(Boolean)
}
