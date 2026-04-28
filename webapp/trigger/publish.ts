import { schedules, task, logger } from "@trigger.dev/sdk/v3"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { eq } from "drizzle-orm"
import * as schema from "../lib/db/schema"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping, type NotionPost } from "../lib/notion"
import { createInstagramPublisher } from "../lib/instagram"
import { createFacebookPublisher } from "../lib/facebook"
import { uploadYouTubeVideo } from "../lib/youtube"
import { publishTikTokVideo } from "../lib/tiktok"
import { publishLinkedInPost } from "../lib/linkedin"
import { generateId } from "../lib/utils"

function getDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle(sql, { schema })
}

// ─── Scheduled: roda a cada 5 minutos para todos os workspaces ────────────

export const publishScheduled = schedules.task({
  id: "publish-scheduled-posts",
  cron: "*/5 * * * *",
  run: async () => {
    const db = getDb()
    const connections = await db.select().from(schema.notionConnection)
    const ready = connections.filter((c) => c.databaseId)
    logger.info(`Verificando ${ready.length} workspaces com banco configurado...`)

    const results = await Promise.allSettled(
      ready.map((c) => publishForConnection.triggerAndWait({ connectionId: c.id }))
    )

    const ok = results.filter((r) => r.status === "fulfilled").length
    const err = results.filter((r) => r.status === "rejected").length
    logger.info(`Finalizado: ${ok} workspaces OK, ${err} com erro.`)
  },
})

// ─── Task por workspace/conexão ───────────────────────────────────────────

export const publishForConnection = task({
  id: "publish-for-connection",
  retry: { maxAttempts: 2 },
  run: async ({ connectionId }: { connectionId: string }) => {
    const db = getDb()

    const [connection] = await db
      .select()
      .from(schema.notionConnection)
      .where(eq(schema.notionConnection.id, connectionId))

    if (!connection?.databaseId) {
      logger.info(`Conexão ${connectionId} sem banco Notion configurado.`)
      return { published: 0, failed: 0, skipped: 0 }
    }

    const { userId } = connection

    const [mappingRow] = await db
      .select()
      .from(schema.fieldMapping)
      .where(eq(schema.fieldMapping.connectionId, connectionId))

    const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING

    const igAccounts = await db
      .select()
      .from(schema.instagramAccount)
      .where(eq(schema.instagramAccount.userId, userId))

    const activeAccounts = igAccounts.filter((a) => a.active)
    if (!activeAccounts.length) {
      logger.info(`Usuário ${userId} sem contas ativas.`)
      return { published: 0, failed: 0, skipped: 0 }
    }

    // Map: "platform:conta" → account row
    const accountMap = new Map(
      activeAccounts.map((a) => [`${a.platform}:${a.conta.toLowerCase()}`, a])
    )

    const notion = createNotionClient(connection.accessToken)

    let posts: NotionPost[]
    try {
      posts = await notion.getReadyPosts(connection.databaseId, mapping)
    } catch (e) {
      logger.error(`Erro ao buscar posts no Notion (workspace ${connection.workspaceName}): ${e}`)
      return { published: 0, failed: 0, skipped: 0 }
    }

    if (!posts.length) {
      logger.info(`Nenhum post agendado no workspace ${connection.workspaceName}.`)
      return { published: 0, failed: 0, skipped: 0 }
    }

    logger.info(`${posts.length} post(s) encontrado(s) no workspace ${connection.workspaceName}.`)
    const results = { published: 0, failed: 0, skipped: 0 }

    for (const post of posts) {
      const plataformas = post.plataformas?.length ? post.plataformas : ["instagram"]

      for (const plataforma of plataformas) {
        const key = `${plataforma.toLowerCase()}:${post.conta.toLowerCase()}`
        const account = accountMap.get(key)

        if (!account) {
          logger.warn(`[${plataforma}] Conta "${post.conta}" não configurada — "${post.title}" ignorado.`)
          await saveLog(db, userId, connectionId, post, null, plataforma, "skipped", `Conta "${post.conta}" não encontrada para ${plataforma}`)
          results.skipped++
          continue
        }

        try {
          const postId = await publishToPlatform(plataforma, account, post)
          await saveLog(db, userId, connectionId, post, postId, plataforma, "published", null)
          logger.info(`[${plataforma}/${post.conta}] ✓ "${post.title}" publicado! ID: ${postId}`)
          results.published++
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.error(`[${plataforma}/${post.conta}] ✗ "${post.title}": ${message}`)
          await saveLog(db, userId, connectionId, post, null, plataforma, "failed", message)
          results.failed++
        }
      }

      // Mark as published in Notion after all platforms attempted
      const anyPublished = plataformas.some((p) => {
        const key = `${p.toLowerCase()}:${post.conta.toLowerCase()}`
        return accountMap.has(key)
      })
      if (anyPublished) {
        try { await notion.markPublished(post.pageId, mapping) } catch {}
      } else {
        try { await notion.markFailed(post.pageId, mapping) } catch {}
      }
    }

    logger.info(
      `Workspace ${connection.workspaceName}: ${results.published} publicados, ${results.failed} erros, ${results.skipped} ignorados.`
    )
    return results
  },
})

// ─── Roteamento por plataforma ────────────────────────────────────────────

async function publishToPlatform(
  plataforma: string,
  account: typeof schema.instagramAccount.$inferSelect,
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

// ─── Instagram (lógica original) ─────────────────────────────────────────

async function publishInstagram(
  account: typeof schema.instagramAccount.$inferSelect,
  post: NotionPost
): Promise<string> {
  const publisher = createInstagramPublisher(
    account.instagramBusinessAccountId,
    account.pageAccessToken
  )
  return publishPost(publisher, post)
}

async function publishPost(
  publisher: ReturnType<typeof createInstagramPublisher>,
  post: NotionPost
): Promise<string> {
  const tipo = post.tipo.toLowerCase()

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

  if (tipo === "feed vídeo" || tipo === "feed video") {
    const videoUrl = post.feedImageUrls[0] ?? post.verticalUrls[0]
    if (!videoUrl) throw new Error("Feed Vídeo requer mídia em Imagens Feed ou Mídia Vertical")
    return publisher.publishFeedVideo(videoUrl, post.fullCaption, post.thumbnailUrl)
  }

  const images = post.feedImageUrls.length > 0 ? post.feedImageUrls : post.verticalUrls
  if (!images.length) throw new Error("Feed requer ao menos uma imagem em Imagens Feed ou Mídia Vertical")
  if (images.length > 1) return publisher.publishCarousel(images, post.fullCaption)
  return publisher.publishFeedImage(images[0], post.fullCaption)
}

function isVideo(url: string): boolean {
  return /\.(mp4|mov|avi|mkv|webm)(\?|$)/i.test(url)
}

// ─── Log ───────────────────────────────────────────────────────────────────

async function saveLog(
  db: ReturnType<typeof getDb>,
  userId: string,
  connectionId: string,
  post: NotionPost,
  postId: string | null,
  platform: string,
  status: "published" | "failed" | "skipped",
  error: string | null
) {
  await db.insert(schema.publishLog).values({
    id: generateId(),
    userId,
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
