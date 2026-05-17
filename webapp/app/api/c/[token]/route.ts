import { db } from "@/lib/db"
import {
  approvalLink,
  client as clientTable,
  fieldMapping,
  instagramAccount,
  notionConnection,
  production,
  publishLog,
} from "@/lib/db/schema"
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping, type NotionPost } from "@/lib/notion"
import { STATUS_LABEL_PT, type ProductionStatus } from "@/lib/productions"
import { listAccessibleClients } from "@/lib/active-client"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

// Public client-calendar API. NO AUTH — the URL token IS the auth. Used
// by /c/{token} (the page) to render:
//   - Pending approvals (with embedded approval token for inline decide)
//   - Scheduled posts (next 60d)
//   - Published posts (last 90d)
// Token is permanent per client (client.publicCalendarToken). One link
// the agency shares with the client once via WhatsApp; client saves it
// and reopens whenever they want.

const PAST_WINDOW_DAYS = 90

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // 60/min/IP — esse endpoint faz queries Notion + DB caras. Cliente
  // legítimo abre 1x, talvez auto-refresh. 60/min bloqueia bot scraping
  // sem incomodar uso humano.
  const ip = clientIp(req)
  if (checkRateLimit(`c:${ip}`, { max: 60, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  // Look up client by permanent calendar token.
  const [client] = await db
    .select()
    .from(clientTable)
    .where(eq(clientTable.publicCalendarToken, token))

  if (!client) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // All Notion connections owned by this client (an agency might have
  // multiple workspaces per client; usually just one).
  const connections = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, client.id))

  const ready = connections.filter((c) => c.databaseId)

  // Conta-ownership routing — public surface mirror of /api/notion/scheduled.
  // A single Notion DB can host posts for several brands; without this we'd
  // leak sibling-client posts into this client's public calendar. We resolve
  // owner using ALL agency-accessible clients (sibling brand might claim
  // a conta even if it doesn't have its own Notion connection).
  const accessibleSiblings = await listAccessibleClients(client.userId)
  const accessibleIds = accessibleSiblings.map((s) => s.id)
  function findExplicitOwner(contaKey: string): string | null {
    if (!contaKey) return null
    const byName = accessibleSiblings.find((c) => c.name.trim().toLowerCase() === contaKey)
    if (byName) return byName.id
    for (const s of accessibleSiblings) {
      const claims = s.notionContaValues ?? []
      if (claims.some((v) => v.trim().toLowerCase() === contaKey)) return s.id
    }
    return null
  }
  // Active IG accounts owned by THIS client — used by the legacy fallback
  // when no explicit owner is found for a conta.
  const ownAccounts = await db
    .select()
    .from(instagramAccount)
    .where(eq(instagramAccount.clientId, client.id))
  const ownContas = new Set(
    ownAccounts.filter((a) => a.active).map((a) => a.conta.toLowerCase()),
  )
  function postBelongsHere(conta: string | null | undefined): boolean {
    const k = (conta ?? "").trim().toLowerCase()
    if (!k) return false
    const ownerId = findExplicitOwner(k)
    if (ownerId) return ownerId === client.id
    return ownContas.has(k)
  }

  // Aggregate posts per connection. Pending = awaitingApprovalValue,
  // scheduled = statusReadyValue. We fan out and collect, since each
  // workspace might use a different status mapping.
  const pendingPosts: Array<NotionPost & { connectionId: string; approvalToken: string | null }> = []
  const scheduledPosts: Array<NotionPost & { connectionId: string }> = []

  for (const conn of ready) {
    const [mappingRow] = await db
      .select()
      .from(fieldMapping)
      .where(eq(fieldMapping.connectionId, conn.id))
    const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING

    const notion = createNotionClient(conn.accessToken)

    // Pending approval
    if (mapping.awaitingApprovalValue) {
      try {
        const posts = await notion.getPostsByStatus(conn.databaseId!, mapping, mapping.awaitingApprovalValue)

        // Match each post with its pending approvalLink token (if any).
        const tokenMap = await db
          .select({
            notionPageId: approvalLink.notionPageId,
            token: approvalLink.token,
          })
          .from(approvalLink)
          .where(and(
            eq(approvalLink.clientId, client.id),
            isNull(approvalLink.decision),
          ))
        const tokenByPage = new Map(tokenMap.map((r) => [r.notionPageId, r.token]))

        for (const p of posts) {
          if (!postBelongsHere(p.conta)) continue
          pendingPosts.push({
            ...p,
            connectionId: conn.id,
            approvalToken: tokenByPage.get(p.pageId) ?? null,
          })
        }
      } catch (e) {
        console.warn(`[/api/c/${token}] failed to fetch pending posts for connection ${conn.id}:`, e)
      }
    }

    // Scheduled (status = statusReadyValue, any future date or already due)
    try {
      const posts = await notion.getScheduledPosts(conn.databaseId!, mapping)
      for (const p of posts) {
        if (!postBelongsHere(p.conta)) continue
        scheduledPosts.push({ ...p, connectionId: conn.id })
      }
    } catch (e) {
      console.warn(`[/api/c/${token}] failed to fetch scheduled posts for connection ${conn.id}:`, e)
    }
  }

  // Past — query publishLog. publish_log.clientId carries the CONNECTION's
  // clientId at publish time, which can differ from the post's conta-owner
  // when one Notion DB hosts multiple brands. Widen the query to all sibling
  // clients and filter by conta ownership before grouping (mirror of the
  // /api/notion/scheduled past branch).
  const cutoff = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const pastLogsRaw = accessibleIds.length
    ? await db
        .select()
        .from(publishLog)
        .where(and(
          inArray(publishLog.clientId, accessibleIds),
          gte(publishLog.publishedAt, cutoff),
        ))
        .orderBy(desc(publishLog.publishedAt))
    : []
  const pastLogs = pastLogsRaw.filter((log) => postBelongsHere(log.conta))

  type PastEntry = {
    pageId: string
    title: string
    conta: string
    date: string
    platforms: Array<{ raw: string; status: string; postUrl: string | null }>
  }
  const pastByPage = new Map<string, PastEntry>()
  for (const log of pastLogs) {
    let entry = pastByPage.get(log.notionPageId)
    if (!entry) {
      entry = {
        pageId: log.notionPageId,
        title: log.postTitle,
        conta: log.conta,
        date: log.publishedAt.toString(),
        platforms: [],
      }
      pastByPage.set(log.notionPageId, entry)
    }
    if (log.platform && !entry.platforms.find((p) => p.raw === log.platform)) {
      entry.platforms.push({
        raw: log.platform,
        status: log.status,
        postUrl: log.platformPostUrl,
      })
    }
    if (new Date(log.publishedAt) < new Date(entry.date)) {
      entry.date = log.publishedAt.toString()
    }
  }
  const past = Array.from(pastByPage.values())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Slim down posts for the response — drop heavy fields, keep what the
  // calendar UI needs.
  function slimPost<T extends NotionPost>(p: T) {
    return {
      pageId: p.pageId,
      title: p.title,
      conta: p.conta,
      scheduledDate: p.scheduledDate,
      publishTargets: p.publishTargets,
      thumbnailUrl: p.thumbnailUrl,
      feedImageUrls: p.feedImageUrls,
      verticalUrls: p.verticalUrls,
      horizontalUrls: p.horizontalUrls,
      previewVerticalUrl: p.previewVerticalUrl,
      previewHorizontalUrl: p.previewHorizontalUrl,
      allMediaUrls: p.allMediaUrls,
      fullCaption: p.fullCaption,
    }
  }

  // Productions for this client. We don't include scriptJson — it's only
  // shown via /approve/[token] when the chain step is theirs. The point of
  // this list is "what's happening with my videos right now".
  const productions = await db
    .select({
      id: production.id,
      title: production.title,
      type: production.type,
      status: production.status,
      topic: production.topic,
      specialistName: production.specialistName,
      recordingDate: production.recordingDate,
      deliveryDate: production.deliveryDate,
      publishDate: production.publishDate,
      finalVideoUrl: production.finalVideoUrl,
      // Flags atualizados pelo cron publishScheduled. Cliente pode baixar
      // direto pelo portal sem precisar ir no Notion. Quando true e a
      // produção foi entregue, o card mostra botão "Baixar V/H".
      hasVerticalMedia: production.hasVerticalMedia,
      hasHorizontalMedia: production.hasHorizontalMedia,
      createdAt: production.createdAt,
      updatedAt: production.updatedAt,
    })
    .from(production)
    .where(eq(production.clientId, client.id))
    .orderBy(desc(production.updatedAt))

  // Lookup any pending approvalLink targeted at this client (production
  // chain steps). The token lets the client open `/approve/[token]` if
  // they happen to be the active approver — usually they're not, since
  // the chain dispatches to specific approvers (a Diretor, a Cliente
  // Final). When NULL, the row just shows status without an approve CTA.
  const pendingChainSteps = await db
    .select({
      productionId: approvalLink.productionId,
      token: approvalLink.token,
    })
    .from(approvalLink)
    .where(and(
      eq(approvalLink.clientId, client.id),
      eq(approvalLink.kind, "production_script"),
      isNull(approvalLink.decision),
    ))
  const tokenByProduction = new Map<string, string>(
    pendingChainSteps
      .filter((s): s is { productionId: string; token: string } => !!s.productionId)
      .map((s) => [s.productionId, s.token])
  )

  return NextResponse.json({
    client: {
      name: client.name,
      logoUrl: client.logoUrl,
      // Quando setado, /c/[token] mostra botão "Solicitar nova produção"
      // que abre esse URL em nova aba (tipicamente um form do Notion
      // que preenche a DB de Produções).
      briefingFormUrl: client.briefingFormUrl ?? null,
    },
    pending: pendingPosts.map((p) => ({
      ...slimPost(p),
      connectionId: p.connectionId,
      approvalToken: p.approvalToken,
    })),
    scheduled: scheduledPosts.map((p) => ({
      ...slimPost(p),
      connectionId: p.connectionId,
    })),
    past,
    productions: productions.map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      status: p.status as ProductionStatus,
      statusLabel: STATUS_LABEL_PT[p.status as ProductionStatus] ?? p.status,
      topic: p.topic,
      specialistName: p.specialistName,
      recordingDate: p.recordingDate,
      deliveryDate: p.deliveryDate,
      publishDate: p.publishDate,
      finalVideoUrl: p.finalVideoUrl,
      hasVerticalMedia: p.hasVerticalMedia,
      hasHorizontalMedia: p.hasHorizontalMedia,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      pendingApprovalToken: tokenByProduction.get(p.id) ?? null,
    })),
  })
}
