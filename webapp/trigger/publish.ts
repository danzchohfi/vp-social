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

// ─── Scheduled: roda a cada 5 minutos para todos os workspaces ──────

export const publishScheduled = schedules.task({
  id: "publish-scheduled-posts",
  cron: { pattern: "*/5 * * * *", timezone: "America/Sao_Paulo" },
  run: async () => {
    const db = getDb()
    const connections = await db.select().from(schema.notionConnection)
    const ready = connections.filter((c) => c.databaseId)
    logger.info(`Verificando ${ready.length} workspaces com banco configurado...`)

    if (!ready.length) return

    const result = await publishForConnection.batchTriggerAndWait(
      ready.map((c) => ({ payload: { connectionId: c.id } }))
    )

    const ok = result.runs.filter((r) => r.ok).length
    const err = result.runs.filter((r) => !r.ok).length
    logger.info(`Finalizado: ${ok} workspaces OK, ${err} com erro.`)
  },
})

// ─── Task por workspace/conexão ───────────────────────────────

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
        await saveLog(db, userId, connectionId, post, null, "—", "skipped", `Campo "Publicar em" vazio`, connection.clientId)
        results.skipped++
        await markNotionStatus(notion, post.pageId, mapping, "failed", post.title)
        continue
      }

      let postSuccess = 0

      for (const target of post.publishTargets) {
        const key = `${target.platform}:${post.conta.toLowerCase()}`
        const account = accountMap.get(key)

        if (!account) {
          logger.warn(`[${target.raw}] Conta "${post.conta}" não configurada — "${post.title}" ignorado.`)
          await saveLog(db, userId, connectionId, post, null, target.raw, "skipped", `Conta "${post.conta}" não encontrada para ${target.platform}`, connection.clientId)
          results.skipped++
          continue
        }

        try {
          const postId = await publishToPlatform(target.platform, target.tipo, account, post)
          await saveLog(db, userId, connectionId, post, postId, target.raw, "published", null, connection.clientId)
          logger.info(`[${target.raw}/${post.conta}] ✓ "${post.title}" publicado! ID: ${postId}`)
          results.published++
          postSuccess++
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.error(`[${target.raw}/${post.conta}] ✗ "${post.title}": ${message}`)
          await saveLog(db, userId, connectionId, post, null, target.raw, "failed", message, connection.clientId)
          results.failed++
        }
      }

      // Sai do filtro "Agendamento" para impedir reprocessamento na próxima execução do cron.
      // Qualquer sucesso conta como publicado; só marca erro se nenhum target deu certo.
      await markNotionStatus(
        notion, post.pageId, mapping,
        postSuccess > 0 ? "published" : "failed",
        post.title
      )
    }

    return results
  },
})

async function markNotionStatus(
  notion: ReturnType<typeof createNotionClient>,
  pageId: string,
  mapping: FieldMapping,
  status: "published" | "failed",
  title: string
) {
  try {
    if (status === "published") await notion.markPublished(pageId, mapping)
    else await notion.markFailed(pageId, mapping)
  } catch (e) {
    logger.error(`Falha ao atualizar status do Notion para "${title}" (${status}): ${e}`)
  }
}
