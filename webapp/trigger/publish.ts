import { schedules, task, logger } from "@trigger.dev/sdk/v3"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { eq } from "drizzle-orm"
import * as schema from "../lib/db/schema"
import { createNotionClient, type FieldMapping } from "../lib/notion"
import { createInstagramPublisher } from "../lib/instagram"
import { generateId } from "../lib/utils"

function getDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle(sql, { schema })
}

// ─── Scheduled: roda a cada 15 minutos para todos os usuários ─────────────

export const publishScheduled = schedules.task({
  id: "publish-scheduled-posts",
  cron: "*/15 * * * *",
  run: async () => {
    const db = getDb()

    const connections = await db
      .select()
      .from(schema.notionConnection)
      .where(eq(schema.notionConnection.databaseId, schema.notionConnection.databaseId))

    logger.info(`Verificando ${connections.length} workspaces Notion...`)

    for (const connection of connections) {
      if (!connection.databaseId) continue
      await publishForUser.triggerAndWait({ userId: connection.userId })
    }
  },
})

// ─── Task por usuário (também pode ser chamada manualmente) ────────────────

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

    const mapping: FieldMapping = mappingRow ?? {
      titleField: "Produção",
      captionField: "Legenda",
      mediaVerticalField: "Mídia Vertical",
      mediaHorizontalField: "Mídia Horizontal",
      statusField: "Status",
      statusReadyValue: "Agendamento",
      statusPublishedValue: "Publicado",
      statusErrorValue: "Erro",
      dateField: "Dia para fazer",
      accountField: "Conta",
    }

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
    const posts = await notion.getReadyPosts(connection.databaseId, mapping)

    if (!posts.length) {
      logger.info(`Nenhum post agendado para usuário ${userId}.`)
      return { published: 0, failed: 0, skipped: 0 }
    }

    logger.info(`${posts.length} posts encontrados para usuário ${userId}.`)

    const results = { published: 0, failed: 0, skipped: 0 }

    for (const post of posts) {
      const account = accountMap.get(post.conta.toLowerCase())

      if (!account) {
        logger.warn(`Conta "${post.conta}" não encontrada — post "${post.title}" ignorado.`)
        await logResult(db, userId, post.pageId, post.title, post.conta, null, "skipped", null)
        results.skipped++
        continue
      }

      if (!post.verticalUrls.length) {
        logger.warn(`Post "${post.title}" sem Mídia Vertical — ignorado.`)
        await logResult(db, userId, post.pageId, post.title, post.conta, null, "skipped", null)
        results.skipped++
        continue
      }

      const publisher = createInstagramPublisher(
        account.instagramBusinessAccountId,
        account.pageAccessToken
      )

      try {
        let igPostId: string
        if (post.verticalUrls.length > 1) {
          logger.info(`[${post.conta}] Publicando carrossel: "${post.title}"`)
          igPostId = await publisher.publishCarousel(post.verticalUrls, post.caption)
        } else {
          logger.info(`[${post.conta}] Publicando imagem: "${post.title}"`)
          igPostId = await publisher.publishSingle(post.verticalUrls[0], post.caption)
        }

        await notion.markPublished(post.pageId, mapping)
        await logResult(db, userId, post.pageId, post.title, post.conta, igPostId, "published", null)
        logger.info(`[${post.conta}] ✓ Publicado! ID: ${igPostId}`)
        results.published++
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`[${post.conta}] ✗ Erro: ${message}`)
        await notion.markFailed(post.pageId, mapping)
        await logResult(db, userId, post.pageId, post.title, post.conta, null, "failed", message)
        results.failed++
      }
    }

    logger.info(`Usuário ${userId}: ${results.published} publicados, ${results.failed} erros, ${results.skipped} ignorados.`)
    return results
  },
})

async function logResult(
  db: ReturnType<typeof getDb>,
  userId: string,
  notionPageId: string,
  postTitle: string | null,
  conta: string | null,
  igPostId: string | null,
  status: "published" | "failed" | "skipped",
  error: string | null
) {
  await db.insert(schema.publishLog).values({
    id: generateId(),
    userId,
    notionPageId,
    postTitle,
    conta,
    instagramPostId: igPostId,
    status,
    error,
  })
}
