import { db } from "@/lib/db"
import {
  client as clientTable,
  fieldMapping,
  notionConnection,
  publishLog,
} from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping } from "@/lib/notion"
import { listAccessibleClients } from "@/lib/active-client"

// Live single-post fetch pro /c/[token]. Usado pelo Preview Dialog
// quando cliente clica num post em Publicados (publishLog não cacheia
// thumb/mídia) e Agendados (signed URLs do Notion expiram em ~1h).
//
// Permission: pageId tem que pertencer ao client do token. Aceita se
// (a) publishLog tem o par (pageId, clientId), OU (b) a conta do post
// bate com algum conta-claim do client. Verificação (b) só roda DEPOIS
// de buscar o post no Notion (precisa do valor da conta).

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; pageId: string }> },
) {
  const { token, pageId } = await params

  const [client] = await db
    .select()
    .from(clientTable)
    .where(eq(clientTable.publicCalendarToken, token))

  if (!client) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // Shortcut: pageId já apareceu em publishLog deste client — confiamos.
  const [logHit] = await db
    .select({ id: publishLog.id })
    .from(publishLog)
    .where(and(
      eq(publishLog.notionPageId, pageId),
      eq(publishLog.clientId, client.id),
    ))
    .limit(1)

  // Connections do client → tenta cada uma até achar o post.
  const connections = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, client.id))

  let foundPost: Awaited<ReturnType<ReturnType<typeof createNotionClient>["getPostById"]>> = null
  for (const conn of connections) {
    const [mappingRow] = await db
      .select()
      .from(fieldMapping)
      .where(eq(fieldMapping.connectionId, conn.id))
    const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING

    const notion = createNotionClient(conn.accessToken)
    const post = await notion.getPostById(pageId, mapping)
    if (post) {
      foundPost = post
      break
    }
  }

  if (!foundPost) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // Permission: se não veio do publishLog, exige conta-ownership match.
  if (!logHit) {
    const siblings = await listAccessibleClients(client.userId)
    const ownClaim = siblings.find((s) => s.id === client.id)
    const ownContas = new Set<string>([
      client.name.trim().toLowerCase(),
      ...(ownClaim?.notionContaValues ?? []).map((v) => v.trim().toLowerCase()),
    ])
    const conta = (foundPost.conta ?? "").trim().toLowerCase()
    if (!ownContas.has(conta)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
  }

  return NextResponse.json({
    pageId: foundPost.pageId,
    title: foundPost.title,
    conta: foundPost.conta,
    scheduledDate: foundPost.scheduledDate,
    publishTargets: foundPost.publishTargets,
    thumbnailUrl: foundPost.thumbnailUrl,
    feedImageUrls: foundPost.feedImageUrls,
    verticalUrls: foundPost.verticalUrls,
    horizontalUrls: foundPost.horizontalUrls,
    previewVerticalUrl: foundPost.previewVerticalUrl,
    previewHorizontalUrl: foundPost.previewHorizontalUrl,
    allMediaUrls: foundPost.allMediaUrls,
    fullCaption: foundPost.fullCaption,
  })
}
