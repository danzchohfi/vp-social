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
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

// Live single-post fetch pro /c/[token]. Usado pelo Preview Dialog
// quando cliente clica num post em Publicados (publishLog não cacheia
// thumb/mídia) e Agendados (signed URLs do Notion expiram em ~1h).
//
// Tenant isolation (3 camadas defesa-em-profundidade):
//   1. publishLog hit + clientId match → confiamos (post foi publicado
//      por esse client).
//   2. getPostById com expectedDatabaseId — rejeita páginas em outro
//      database mesmo se token tiver acesso (cenário cross-tenant via
//      workspace compartilhado).
//   3. Conta-ownership: post.conta tem que estar em notionContaValues
//      DECLARADOS pelo client (não inferimos pelo nome do client —
//      isso era um guess fraco, removido em 2026-05).

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; pageId: string }> },
) {
  const { token, pageId } = await params

  // 30/min/IP — endpoint dispara live fetch ao Notion (caro) e itera
  // connections. Cliente legítimo abre poucas vezes; bot enumerador
  // de pageId fica bloqueado.
  const ip = clientIp(req)
  if (checkRateLimit(`c-post:${ip}`, { max: 30, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

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

  // Connections do client → tenta cada uma até achar o post NO database
  // declarado (expectedDatabaseId). Sem o filtro, um token compartilhado
  // entre clients (clone) podia retornar página de outro tenant.
  const connections = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, client.id))

  let foundPost: Awaited<ReturnType<ReturnType<typeof createNotionClient>["getPostById"]>> = null
  for (const conn of connections) {
    if (!conn.databaseId) continue
    const [mappingRow] = await db
      .select()
      .from(fieldMapping)
      .where(eq(fieldMapping.connectionId, conn.id))
    const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING

    const notion = createNotionClient(conn.accessToken)
    const post = await notion.getPostById(pageId, mapping, conn.databaseId)
    if (post) {
      foundPost = post
      break
    }
  }

  if (!foundPost) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // Permission: se não veio do publishLog, exige conta-ownership EXPLÍCITO.
  // client.name não é mais usado como fallback — agência precisa declarar
  // notionContaValues pra dar acesso.
  if (!logHit) {
    const siblings = await listAccessibleClients(client.userId)
    const ownClaim = siblings.find((s) => s.id === client.id)
    const ownContas = new Set<string>(
      (ownClaim?.notionContaValues ?? []).map((v) => v.trim().toLowerCase()),
    )
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
