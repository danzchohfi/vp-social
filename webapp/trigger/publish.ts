import { schedules, task, logger } from "@trigger.dev/sdk"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { eq } from "drizzle-orm"
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

// ─── Task por workspace/conexão ─────────────────────────────────

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
