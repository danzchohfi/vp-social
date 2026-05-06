import { schedules, task, logger } from "@trigger.dev/sdk"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { and, eq } from "drizzle-orm"
import * as schema from "../lib/db/schema"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping, type NotionPost } from "../lib/notion"
import { publishToPlatform, saveLog } from "../lib/publisher"

function getDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle(sql, { schema })
}

// ─── Scheduled: roda a cada 5 minutos para todos os workspaces ──────────

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

// ─── Task por workspace/conexão ────────────────────────────────

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
      .where(
        connection.clientId
          ? and(eq(schema.instagramAccount.userId, userId), eq(schema.instagramAccount.clientId, connection.clientId))
          : eq(schema.instagramAccount.userId, userId)
      )

    const activeAccounts = igAccounts.filter((a) => a.active)
    if (!activeAccounts.length) {
      logger.info(`Usuário ${userId} sem contas ativas.`)
      return { published: 0, failed: 0, skipped: 0 }
    }

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
      if (!post.publishTargets.length) {
        logger.warn(`Post "${post.title}" sem "Publicar em" definido — ignorado.`)
        await saveLog(db, userId, connectionId, post, null, null, "—", "skipped", `Campo "Publicar em" vazio`, connection.clientId)
        results.skipped++
        continue
      }

      // Track per-post outcome so we can flip the Notion page status to
      // Publicado/Erro at the end. Without this, the cron republishes the
      // same post every 5 minutes because the filter still matches.
      let anyPublished = false
      let anyFailed = false
      // Collect all published-platform URLs so we can write them to the
      // Notion link field as a single rich_text block — multiple platforms
      // would otherwise overwrite each other.
      const publishedLinks: Array<{ platform: string; url: string }> = []

      for (const target of post.publishTargets) {
        const key = `${target.platform}:${post.conta.toLowerCase()}`
        const account = accountMap.get(key)

        if (!account) {
          logger.warn(`[${target.raw}] Conta "${post.conta}" não configurada — "${post.title}" ignorado.`)
          await saveLog(db, userId, connectionId, post, null, null, target.raw, "skipped", `Conta "${post.conta}" não encontrada para ${target.platform}`, connection.clientId)
          results.skipped++
          continue
        }

        try {
          const { id: postId, url: postUrl } = await publishToPlatform(target.platform, target.tipo, account, post)
          await saveLog(db, userId, connectionId, post, postId, postUrl, target.raw, "published", null, connection.clientId)
          if (postUrl) publishedLinks.push({ platform: target.raw, url: postUrl })
          logger.info(`[${target.raw}/${post.conta}] ✓ "${post.title}" publicado! ID: ${postId}${postUrl ? ` URL: ${postUrl}` : ""}`)
          results.published++
          anyPublished = true
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.error(`[${target.raw}/${post.conta}] ✗ "${post.title}": ${message}`)
          await saveLog(db, userId, connectionId, post, null, null, target.raw, "failed", message, connection.clientId)
          results.failed++
          anyFailed = true
        }
      }

      // After all platforms attempted: write the collected links + flip status.
      // Status update is what removes the post from the "ready" filter; without
      // it the cron would republish on the next tick.
      try {
        if (publishedLinks.length > 0) {
          await notion.setPostUrls(post.pageId, mapping, publishedLinks)
        }
        if (anyPublished) await notion.markPublished(post.pageId, mapping)
        else if (anyFailed) await notion.markFailed(post.pageId, mapping)
      } catch (e) {
        logger.warn(`Falha ao atualizar Notion para "${post.title}": ${e}`)
      }
    }

    return results
  },
})
