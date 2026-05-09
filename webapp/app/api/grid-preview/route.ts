import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  fieldMapping,
  instagramAccount,
  notionConnection,
} from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping, type NotionPost } from "@/lib/notion"
import { listInstagramMedia } from "@/lib/instagram"
import { userHasClientAccess } from "@/lib/active-client"

// Returns the data needed to render the IG grid preview: combines the
// most-recent N already-published items (via IG Graph API) with the
// upcoming-scheduled posts pulled from the connected Notion DB(s).
//
// The UI sorts everything by display date (most-recent first → IG's
// natural feed ordering) so the agency can see how the grid will LOOK
// after the next batch goes live. Future posts get a "Agendado X/X"
// badge; published posts link to their permalink.
//
// Query: /api/grid-preview?clientId=X&conta=Y
// - conta required to disambiguate when the client has multiple IG accounts
// - clientId required: must be in user's accessible-clients list

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const clientId = url.searchParams.get("clientId")?.trim() ?? ""
  const conta = url.searchParams.get("conta")?.trim() ?? ""
  if (!clientId || !conta) {
    return NextResponse.json({ error: "clientId + conta obrigatórios" }, { status: 400 })
  }
  const ok = await userHasClientAccess(session.user.id, clientId)
  if (!ok) return NextResponse.json({ error: "Sem acesso a este cliente" }, { status: 403 })

  // Find the IG account row for this conta (exact match, case-insensitive).
  const [account] = await db
    .select()
    .from(instagramAccount)
    .where(and(
      eq(instagramAccount.clientId, clientId),
      eq(instagramAccount.platform, "instagram"),
    ))
    .then((rows) => rows.filter((a) => a.conta.toLowerCase() === conta.toLowerCase()))
  if (!account) {
    return NextResponse.json({ error: "Conta Instagram não encontrada" }, { status: 404 })
  }

  // 1. Already-published media via IG Graph API (12 most recent).
  const publishedRaw = await listInstagramMedia(
    account.instagramBusinessAccountId,
    account.pageAccessToken,
    12,
  )
  const published = publishedRaw.map((m) => ({
    kind: "published" as const,
    id: m.id,
    thumbnailUrl: m.thumbnailUrl,
    permalink: m.permalink,
    timestamp: m.timestamp,
    caption: m.caption,
    mediaType: m.mediaType,
  }))

  // 2. Upcoming scheduled posts targeting IG Feed/Carousel/Reel for
  //    this conta, pulled from each Notion connection on this client.
  const connections = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.clientId, clientId))
  const ready = connections.filter((c) => c.databaseId)

  const upcomingPosts: Array<NotionPost & { connectionId: string }> = []
  for (const conn of ready) {
    const [mappingRow] = await db
      .select()
      .from(fieldMapping)
      .where(eq(fieldMapping.connectionId, conn.id))
    const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING
    try {
      const notion = createNotionClient(conn.accessToken)
      const posts = await notion.getScheduledPosts(conn.databaseId!, mapping)
      for (const p of posts) {
        if (p.conta?.toLowerCase() !== conta.toLowerCase()) continue
        // IG-targeting only — feed/reel/carousel show up in the grid;
        // story doesn't, so exclude it. We tolerate posts that target
        // multiple platforms but only display them in the grid if at
        // least one IG-feed-eligible target exists.
        const igTarget = p.publishTargets.find(
          (t) => t.platform === "instagram"
            && (t.tipo === "feed" || t.tipo === "carrossel" || t.tipo === "reel"),
        )
        if (!igTarget) continue
        upcomingPosts.push({ ...p, connectionId: conn.id })
      }
    } catch (e) {
      console.warn(`[grid-preview] failed to fetch from connection ${conn.id}:`, e)
    }
  }

  // Shape upcoming for the client: pick the best thumbnail (Story/Reel
  // → vertical or thumbnail; Feed/Carousel → first feed image). The
  // grid is "what the user will see"; the cover frame matters.
  const upcoming = upcomingPosts.map((p) => {
    const tipo = p.publishTargets[0]?.tipo ?? "feed"
    let thumb: string | null = null
    if (tipo === "reel") {
      thumb = p.thumbnailUrl ?? p.feedImageUrls[0] ?? p.verticalUrls[0] ?? null
    } else {
      thumb = p.feedImageUrls[0] ?? p.thumbnailUrl ?? p.verticalUrls[0] ?? null
    }
    return {
      kind: "upcoming" as const,
      pageId: p.pageId,
      connectionId: p.connectionId,
      title: p.title,
      thumbnailUrl: thumb,
      caption: p.fullCaption || p.caption || "",
      scheduledDate: p.scheduledDate,
      tipo,
      notionUrl: p.notionUrl,
    }
  })
    .sort((a, b) => {
      // Newest scheduled first (chronologically the latest = newest in grid).
      const da = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0
      const dbT = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0
      return dbT - da
    })

  return NextResponse.json({
    account: {
      conta: account.conta,
      pageName: account.pageName,
    },
    upcoming,
    published,
  })
}
