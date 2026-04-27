import { schedules, task, logger } from "@trigger.dev/sdk/v3"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { eq } from "drizzle-orm"
import * as schema from "../lib/db/schema"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping, type NotionPost } from "../lib/notion"
import { createInstagramPublisher } from "../lib/instagram"
import { generateId } from "../lib/utils"

function getDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle(sql, { schema })
}

// ─── Scheduled: roda a cada 5 minutos para todos os usuários ──────────────

export const publishScheduled = schedules.task({
  id: "publish-scheduled-posts",
  cron: "*/5 * * * *",
  run: async () => {
    const db = getDb()
    const connections = await db.select().from(schema.notionConnection)
    logger.info(`Verificando ${connections.length} workspaces Notion...`)

    const results = await Promise.allSettled(
      connections
        .filter((c) => c.databaseId)
        .map((c) => publishForUser.triggerAndWait({ userId: c.userId }))
    )

    const ok = results.filter((r) => r.status === "fulfilled").length
    const err = results.filter((r) => r.status === "rejected").length
    logger.info(`Finalizado: ${ok} usuários OK, ${err} com erro.`)
  },
})

// ─── Task por usuário ──────────────────────────────────────────────────────

export const publishForUser = task({
  id: "publish-for-user",
  retry: { maxAttempts: 2 },
  run: async ({ userId }: { userId: string }) => {
    const db = getDb()

    const [connection] = await db
      .select()
      .from(schema.notionConnection)
      .where(eq(schema.notionConnection.userId, userId))

    if (!connection?.databaseId) {
      logger.info(`Usuário ${userId} sem banco Notion configurado.`)
      return { published: 0, failed: 0, skipped: 0 }
    }

    const [mappingRow] = await db
      .select()
      .from(schema.fieldMapping)
      .where(eq(schema.fieldMapping.userId, userId))

    const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING

    const igAccounts = await db
      .select()
      .from(schema.instagramAccount)
      .where(eq(schema.instagramAccount.userId, userId))

    const activeAccounts = igAccounts.filter((a) => a.active)
    if (!activeAccounts.length) {
      logger.info(`Usuário ${userId} sem contas Instagram ativas.`)
      return { published: 0, failed: 0, skipped: 0 }
    }

    const accountMap = new Map(activeAccounts.map((a) => [a.conta.toLowerCase(), a]))
    const notion = createNotionClient(connection.accessToken)

    let posts: NotionPost[]
    try {
      posts = await notion.getReadyPosts(connection.databaseId, mapping)
    } catch (e) {
      logger.error(`Erro ao buscar posts no Notion para ${userId}: ${e}`)
      return { published: 0, failed: 0, skipped: 0 }
    }

    if (!posts.length) {
      logger.info(`Nenhum post agendado para usuário ${userId}.`)
      return { published: 0, failed: 0, skipped: 0 }
    }

    logger.info(`${posts.length} post(s) encontrado(s) para usuário ${userId}.`)
    const results = { published: 0, failed: 0, skipped: 0 }

    for (const post of posts) {
      const account = accountMap.get(post.conta.toLowerCase())

      if (!account) {
        logger.warn(`Conta "${post.conta}" não configurada — "${post.title}" ignorado.`)
        await saveLog(db, userId, post, null, "skipped", `Conta "${post.conta}" não encontrada`)
        results.skipped++
        continue
      }

      const publisher = createInstagramPublisher(
        account.instagramBusinessAccountId,
        account.pageAccessToken
      )

      try {
        const igPostId = await publishPost(publisher, post)
        await notion.markPublished(post.pageId, mapping)
        await saveLog(db, userId, post, igPostId, "published", null)
        logger.info(`[${post.conta}] ✓ "${post.title}" (${post.tipo}) publicado! ID: ${igPostId}`)
        results.published++
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`[${post.conta}] ✗ "${post.title}": ${message}`)
        await notion.markFailed(post.pageId, mapping)
        await saveLog(db, userId, post, null, "failed", message)
        results.failed++
      }
    }

    logger.info(
      `Usuário ${userId}: ${results.published} publicados, ${results.failed} erros, ${results.skipped} ignorados.`
    )
    return results
  },
})

// ─── Roteamento por tipo de conteúdo ──────────────────────────────────────

async function publishPost(
  publisher: ReturnType<typeof createInstagramPublisher>,
  post: NotionPost
): Promise<string> {
  const tipo = post.tipo.toLowerCase()

  // Story
  if (tipo === "story") {
    const videoUrl = post.verticalUrls[0]
    const imageUrl = post.feedImageUrls[0] ?? post.verticalUrls[0]
    if (videoUrl && isVideo(videoUrl)) {
      return publisher.publishStoryVideo(videoUrl)
    }
    if (imageUrl) {
      return publisher.publishStoryImage(imageUrl)
    }
    throw new Error("Story requer Mídia Vertical (vídeo) ou Imagens Feed (imagem)")
  }

  // Reel
  if (tipo === "reel") {
    const videoUrl = post.verticalUrls[0]
    if (!videoUrl) throw new Error("Reel requer um vídeo em Mídia Vertical")
    return publisher.publishReel(videoUrl, post.fullCaption, post.thumbnailUrl)
  }

  // Carrossel
  if (tipo === "carrossel") {
    const images = post.feedImageUrls.length > 0 ? post.feedImageUrls : post.verticalUrls
    if (images.length < 2) throw new Error("Carrossel requer pelo menos 2 imagens em Imagens Feed")
    return publisher.publishCarousel(images, post.fullCaption)
  }

  // Feed vídeo
  if (tipo === "feed vídeo" || tipo === "feed video") {
    const videoUrl = post.feedImageUrls[0] ?? post.verticalUrls[0]
    if (!videoUrl) throw new Error("Feed Vídeo requer mídia em Imagens Feed ou Mídia Vertical")
    return publisher.publishFeedVideo(videoUrl, post.fullCaption, post.thumbnailUrl)
  }

  // Feed (imagem única — padrão)
  const images = post.feedImageUrls.length > 0 ? post.feedImageUrls : post.verticalUrls
  if (!images.length) throw new Error("Feed requer ao menos uma imagem em Imagens Feed ou Mídia Vertical")

  if (images.length > 1) {
    // múltiplas imagens → carrossel automaticamente
    return publisher.publishCarousel(images, post.fullCaption)
  }

  return publisher.publishFeedImage(images[0], post.fullCaption)
}

function isVideo(url: string): boolean {
  return /\.(mp4|mov|avi|mkv|webm)(\?|$)/i.test(url)
}

// ─── Log ───────────────────────────────────────────────────────────────────

async function saveLog(
  db: ReturnType<typeof getDb>,
  userId: string,
  post: NotionPost,
  igPostId: string | null,
  status: "published" | "failed" | "skipped",
  error: string | null
) {
  await db.insert(schema.publishLog).values({
    id: generateId(),
    userId,
    notionPageId: post.pageId,
    postTitle: post.title,
    conta: post.conta,
    instagramPostId: igPostId,
    status,
    error,
  })
}
