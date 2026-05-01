import * as schema from "./db/schema"
import { createInstagramPublisher } from "./instagram"
import { createFacebookPublisher } from "./facebook"
import { uploadYouTubeVideo } from "./youtube"
import { publishTikTokVideo } from "./tiktok"
import { publishLinkedInPost } from "./linkedin"
import { generateId } from "./utils"
import type { NotionPost } from "./notion"

type Account = typeof schema.instagramAccount.$inferSelect

export function isVideo(url: string): boolean {
  return /\.(mp4|mov|avi|mkv|webm)(\?|$)/i.test(url)
}

export function normalizeTipo(raw: string): string {
  const t = raw.toLowerCase().trim()
  if (t.includes("story") || t.includes("storie")) return "story"
  if (t.includes("reel")) return "reel"
  if (t.includes("carrossel") || t.includes("carousel")) return "carrossel"
  if (t.includes("vídeo") || t.includes("video")) return "feed vídeo"
  return "feed"
}

export async function publishToPlatform(
  plataforma: string,
  account: Account,
  post: NotionPost
): Promise<string> {
  const p = plataforma.toLowerCase()

  if (p === "instagram") {
    return publishInstagram(account, post)
  }

  if (p === "facebook") {
    const fb = createFacebookPublisher(account.pageId, account.pageAccessToken)
    const images = post.feedImageUrls.length > 0 ? post.feedImageUrls : post.verticalUrls
    if (post.verticalUrls[0] && isVideo(post.verticalUrls[0])) {
      return fb.publishVideo(post.verticalUrls[0], post.fullCaption, post.title)
    }
    if (images.length > 1) return fb.publishCarousel(images, post.fullCaption)
    if (images.length === 1) return fb.publishSingleImage(images[0], post.fullCaption)
    return fb.publishFeedPost(post.fullCaption)
  }

  if (p === "youtube" || p === "youtube short" || p === "youtube shorts") {
    const videoUrl = post.verticalUrls[0] ?? post.horizontalUrls[0]
    if (!videoUrl) throw new Error("YouTube requer um vídeo em Mídia Vertical ou Mídia Horizontal")
    const isShort = p.includes("short")
    return uploadYouTubeVideo(
      account.pageAccessToken,
      account.refreshToken!,
      post.title,
      post.fullCaption,
      videoUrl,
      isShort
    )
  }

  if (p === "tiktok") {
    const videoUrl = post.verticalUrls[0]
    if (!videoUrl) throw new Error("TikTok requer um vídeo em Mídia Vertical")
    return publishTikTokVideo(
      account.platformAccountId ?? account.pageId,
      account.pageAccessToken,
      account.refreshToken!,
      videoUrl,
      post.fullCaption
    )
  }

  if (p === "linkedin") {
    const personUrn = account.platformAccountId ?? `urn:li:person:${account.pageId}`
    const imageUrl = post.feedImageUrls[0] ?? post.horizontalUrls[0]
    return publishLinkedInPost(
      personUrn,
      account.pageAccessToken,
      account.refreshToken!,
      post.fullCaption,
      imageUrl
    )
  }

  throw new Error(`Plataforma "${plataforma}" não suportada`)
}

async function publishInstagram(account: Account, post: NotionPost): Promise<string> {
  const publisher = createInstagramPublisher(
    account.instagramBusinessAccountId,
    account.pageAccessToken
  )
  return publishInstagramPost(publisher, post)
}

async function publishInstagramPost(
  publisher: ReturnType<typeof createInstagramPublisher>,
  post: NotionPost
): Promise<string> {
  const tipo = normalizeTipo(post.tipo)

  if (tipo === "story") {
    const videoUrl = post.verticalUrls[0]
    const imageUrl = post.feedImageUrls[0] ?? post.verticalUrls[0]
    if (videoUrl && isVideo(videoUrl)) return publisher.publishStoryVideo(videoUrl)
    if (imageUrl) return publisher.publishStoryImage(imageUrl)
    throw new Error("Story requer Mídia Vertical (vídeo) ou Imagens Feed (imagem)")
  }

  if (tipo === "reel") {
    const videoUrl = post.verticalUrls[0]
    if (!videoUrl) throw new Error("Reel requer um vídeo em Mídia Vertical")
    return publisher.publishReel(videoUrl, post.fullCaption, post.thumbnailUrl)
  }

  if (tipo === "carrossel") {
    const images = post.feedImageUrls.length > 0 ? post.feedImageUrls : post.verticalUrls
    if (images.length < 2) throw new Error("Carrossel requer pelo menos 2 imagens em Imagens Feed")
    return publisher.publishCarousel(images, post.fullCaption)
  }

  if (tipo === "feed vídeo") {
    const videoUrl = post.feedImageUrls[0] ?? post.verticalUrls[0]
    if (!videoUrl) throw new Error("Feed Vídeo requer mídia em Imagens Feed ou Mídia Vertical")
    return publisher.publishFeedVideo(videoUrl, post.fullCaption, post.thumbnailUrl)
  }

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
    status,
    error,
  })
}
