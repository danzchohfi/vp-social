import * as schema from "./db/schema"
import { createInstagramPublisher, fetchInstagramPermalink } from "./instagram"
import { createFacebookPublisher } from "./facebook"
import { uploadYouTubeVideo } from "./youtube"
import { publishTikTokVideo } from "./tiktok"
import { publishLinkedInPost } from "./linkedin"
import { generateId } from "./utils"
import type { NotionPost } from "./notion"
import { and, desc, eq } from "drizzle-orm"

type Account = typeof schema.instagramAccount.$inferSelect

export type PublishResult = { id: string; url: string | null }

export function isVideo(url: string): boolean {
  return /\.(mp4|mov|avi|mkv|webm)(\?|$)/i.test(url)
}

export async function publishToPlatform(
  platform: string,
  tipo: string,
  account: Account,
  post: NotionPost
): Promise<PublishResult> {
  const p = platform.toLowerCase()

  if (p === "instagram") {
    const publisher = createInstagramPublisher(
      account.instagramBusinessAccountId,
      account.pageAccessToken
    )
    const id = await publishInstagramPost(publisher, tipo, post)
    const url = await fetchInstagramPermalink(id, account.pageAccessToken)
    return { id, url }
  }

  if (p === "facebook") {
    const fb = createFacebookPublisher(account.pageId, account.pageAccessToken)
    const images = post.feedImageUrls.length > 0 ? post.feedImageUrls : post.verticalUrls
    let id: string
    if (post.verticalUrls[0] && isVideo(post.verticalUrls[0])) {
      id = await fb.publishVideo(post.verticalUrls[0], post.fullCaption, post.title)
    } else if (images.length > 1) {
      id = await fb.publishCarousel(images, post.fullCaption)
    } else if (images.length === 1) {
      id = await fb.publishSingleImage(images[0], post.fullCaption)
    } else {
      id = await fb.publishFeedPost(post.fullCaption)
    }
    // Facebook returns "{pageId}_{postId}". Both forms work as redirects to
    // the public post URL.
    return { id, url: `https://www.facebook.com/${id}` }
  }

  if (p === "youtube") {
    const videoUrl = post.verticalUrls[0] ?? post.horizontalUrls[0]
    if (!videoUrl) throw new Error("YouTube requer um vídeo em Mídia Vertical ou Mídia Horizontal")
    const isShort = tipo.toLowerCase().includes("short")
    const id = await uploadYouTubeVideo(
      account.pageAccessToken,
      account.refreshToken!,
      videoUrl,
      post.title,
      post.fullCaption,
      isShort
    )
    const url = isShort
      ? `https://www.youtube.com/shorts/${id}`
      : `https://www.youtube.com/watch?v=${id}`
    return { id, url }
  }

  if (p === "tiktok") {
    const videoUrl = post.verticalUrls[0]
    if (!videoUrl) throw new Error("TikTok requer um vídeo em Mídia Vertical")
    const id = await publishTikTokVideo(
      account.platformAccountId ?? account.pageId,
      account.pageAccessToken,
      account.refreshToken!,
      videoUrl,
      post.fullCaption
    )
    // TikTok's publish_id isn't a public URL — actual video URL needs
    // polling the publish status. Skip URL writeback for now.
    return { id, url: null }
  }

  if (p === "linkedin") {
    const personUrn = account.platformAccountId ?? `urn:li:person:${account.pageId}`
    const imageUrl = post.feedImageUrls[0] ?? post.horizontalUrls[0]
    const id = await publishLinkedInPost(
      personUrn,
      account.pageAccessToken,
      account.refreshToken!,
      post.fullCaption,
      imageUrl
    )
    // LinkedIn returns a URN like "urn:li:share:7234..." — the public URL
    // accepts the URN directly.
    return { id, url: `https://www.linkedin.com/feed/update/${id}` }
  }

  throw new Error(`Plataforma "${platform}" não suportada`)
}

async function publishInstagramPost(
  publisher: ReturnType<typeof createInstagramPublisher>,
  tipo: string,
  post: NotionPost
): Promise<string> {
  const t = tipo.toLowerCase().trim()

  if (t === "story") {
    const videoUrl = post.verticalUrls[0]
    const imageUrl = post.feedImageUrls[0] ?? post.verticalUrls[0]
    if (videoUrl && isVideo(videoUrl)) return publisher.publishStoryVideo(videoUrl)
    if (imageUrl) return publisher.publishStoryImage(imageUrl)
    throw new Error("Story requer Mídia Vertical (vídeo) ou Imagens Feed (imagem)")
  }

  if (t === "reel") {
    const videoUrl = post.verticalUrls[0]
    if (!videoUrl) throw new Error("Reel requer um vídeo em Mídia Vertical")
    return publisher.publishReel(videoUrl, post.fullCaption, post.thumbnailUrl)
  }

  if (t === "carrossel") {
    const images = post.feedImageUrls.length > 0 ? post.feedImageUrls : post.verticalUrls
    if (images.length < 2) throw new Error("Carrossel requer pelo menos 2 imagens em Imagens Feed")
    return publisher.publishCarousel(images, post.fullCaption)
  }

  // tipo "feed" — imagem única ou múltiplas
  const images = post.feedImageUrls.length > 0 ? post.feedImageUrls : post.verticalUrls
  if (!images.length) throw new Error("Feed requer ao menos uma imagem em Imagens Feed ou Mídia Vertical")
  if (images.length > 1) return publisher.publishCarousel(images, post.fullCaption)
  return publisher.publishFeedImage(images[0], post.fullCaption)
}

export async function saveLog(
  db: any,
  userId: string,
  connectionId: string,
  post: NotionPost,
  postId: string | null,
  postUrl: string | null,
  platform: string,
  status: "published" | "failed" | "skipped",
  error: string | null,
  clientId?: string | null
) {
  await db.insert(schema.publishLog).values({
    id: generateId(),
    userId,
    clientId: clientId ?? null,
    connectionId,
    notionPageId: post.pageId,
    postTitle: post.title,
    conta: post.conta,
    platform,
    instagramPostId: platform === "instagram" ? postId : null,
    platformPostId: postId,
    platformPostUrl: postUrl,
    status,
    error,
  })
}

export type ClaimResult = { rowId: string } | { conflict: true }

/**
 * Reserve a (connection, page, platform) slot before calling the external
 * platform API. Inserts a row with status='pending'; the partial unique
 * index (publish_log_inflight_uniq) makes this atomic.
 *
 * Return shape:
 *   - `{ rowId }` — slot is yours, proceed to publish, then completePublishSlot.
 *   - `{ conflict: true }` — another worker has the slot OR a 'published' row
 *     already exists. Caller must skip without calling the external API.
 *
 * Why this matters: the previous "SELECT pre-check then INSERT after" pattern
 * had a race window where two workers could both see "no published row",
 * both call IG, and both create real Instagram posts before either logged
 * anything. The user hit this on 2026-05-08 and got 2 duplicate Reels
 * uploaded. The pending-row claim closes that window at the DB level.
 */
export async function claimPublishSlot(
  db: any,
  userId: string,
  connectionId: string,
  post: NotionPost,
  platform: string,
  clientId?: string | null,
): Promise<ClaimResult> {
  // Belt-and-suspenders SELECT pre-check. The partial unique index is the
  // race-proof guarantee, but a separate SELECT here protects against the
  // edge case where the index was somehow not enforcing (migration not
  // applied, manually dropped, schema drift). It's not race-proof on its
  // own — two workers could both see "no row" and both INSERT — but the
  // unique index still wins that race. With both layers, even if the index
  // is gone we never publish to IG/FB twice for the same (conn,page,platform).
  const existing = await db
    .select({ status: schema.publishLog.status })
    .from(schema.publishLog)
    .where(and(
      eq(schema.publishLog.connectionId, connectionId),
      eq(schema.publishLog.notionPageId, post.pageId),
      eq(schema.publishLog.platform, platform),
    ))
    .orderBy(desc(schema.publishLog.publishedAt))
    .limit(1)
  if (existing.length > 0 && (existing[0].status === "published" || existing[0].status === "pending")) {
    return { conflict: true }
  }

  const rowId = generateId()
  try {
    await db.insert(schema.publishLog).values({
      id: rowId,
      userId,
      clientId: clientId ?? null,
      connectionId,
      notionPageId: post.pageId,
      postTitle: post.title,
      conta: post.conta,
      platform,
      status: "pending",
    })
    return { rowId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Postgres unique violation = SQLSTATE 23505. The Neon HTTP driver wraps
    // it but preserves the message which contains the index name.
    if (msg.includes("publish_log_inflight_uniq") || /unique|duplicate key|23505/i.test(msg)) {
      return { conflict: true }
    }
    throw e
  }
}

/**
 * Page-level pre-check: returns `true` if ANY `publish_log` row exists
 * for the (connection, page) pair with status='published'. Used by the
 * cron BEFORE it splits + publishes a post — if any prior tick already
 * published anything for this page, we refuse to process any of its
 * targets and let the Notion-status-flip recovery path handle catching
 * up. This is the strongest defense against duplicate publishes: it
 * doesn't depend on the per-target dedup index holding.
 */
export async function hasPriorPublish(
  db: any,
  connectionId: string,
  notionPageId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.publishLog.id })
    .from(schema.publishLog)
    .where(and(
      eq(schema.publishLog.connectionId, connectionId),
      eq(schema.publishLog.notionPageId, notionPageId),
      eq(schema.publishLog.status, "published"),
    ))
    .limit(1)
  return rows.length > 0
}

/**
 * Transition a pending publish_log row to its terminal state. Pair with
 * claimPublishSlot — never call this without a successful claim first.
 */
export async function completePublishSlot(
  db: any,
  rowId: string,
  platform: string,
  status: "published" | "failed",
  postId: string | null,
  postUrl: string | null,
  error: string | null,
): Promise<void> {
  // `platform` here is the full target.raw or chunk variant (e.g.
  // "Instagram Reel", "Instagram Story 1/2") — never the bare word
  // "instagram". Case-insensitive prefix check covers both. Without
  // this, instagramPostId stays null for every IG row and the analytics
  // sync silently skips them all (it filters on instagramPostId IS NOT NULL).
  const isInstagram = /^instagram(\s|$)/i.test(platform.trim())
  await db
    .update(schema.publishLog)
    .set({
      status,
      platformPostId: postId,
      platformPostUrl: postUrl,
      instagramPostId: isInstagram ? postId : null,
      error,
    })
    .where(eq(schema.publishLog.id, rowId))
}
