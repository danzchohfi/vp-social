import { schedules, task, logger } from "@trigger.dev/sdk"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { eq, and, isNotNull, gte, sql } from "drizzle-orm"
import * as schema from "../lib/db/schema"
import { createNotionClient, DEFAULT_MAPPING } from "../lib/notion"
import { getPostMetrics } from "../lib/instagram"

function getDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle(sql, { schema })
}

// ─── Scheduled: roda a cada 6h, sincroniza métricas dos últimos 30 dias ───

export const syncAnalyticsScheduled = schedules.task({
  id: "sync-analytics-scheduled",
  cron: "0 */6 * * *",
  run: async () => {
    const db = getDb()
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const logs = await db
      .select()
      .from(schema.publishLog)
      .where(
        and(
          isNotNull(schema.publishLog.instagramPostId),
          isNotNull(schema.publishLog.connectionId),
          eq(schema.publishLog.status, "published"),
          gte(schema.publishLog.publishedAt, cutoff)
        )
      )

    logger.info(`Sincronizando analytics de ${logs.length} posts...`)

    const results = await Promise.allSettled(
      logs.map((log) => syncPostAnalytics.triggerAndWait({ logId: log.id }))
    )

    const ok = results.filter((r) => r.status === "fulfilled").length
    const err = results.filter((r) => r.status === "rejected").length
    logger.info(`Analytics: ${ok} atualizados, ${err} com erro.`)
  },
})

// ─── Task por post ────────────────────────────────────────────────────────

export const syncPostAnalytics = task({
  id: "sync-post-analytics",
  retry: { maxAttempts: 2 },
  run: async ({ logId }: { logId: string }) => {
    const db = getDb()

    const [log] = await db
      .select()
      .from(schema.publishLog)
      .where(eq(schema.publishLog.id, logId))

    if (!log?.instagramPostId || !log?.connectionId) return { skipped: true }

    // Get Notion connection + field mapping
    const [[connection], [mappingRow]] = await Promise.all([
      db.select().from(schema.notionConnection).where(eq(schema.notionConnection.id, log.connectionId)),
      db.select().from(schema.fieldMapping).where(eq(schema.fieldMapping.connectionId, log.connectionId)),
    ])

    if (!connection) return { skipped: true }

    const mapping = mappingRow ?? DEFAULT_MAPPING

    // Check if any analytics fields are mapped — skip if none
    const hasAnalyticsMapping = !!(
      mapping.likesField || mapping.reachField ||
      mapping.commentsField || mapping.savesField || mapping.impressionsField
    )
    if (!hasAnalyticsMapping) return { skipped: true, reason: "no analytics fields mapped" }

    // Get Instagram access token via conta match
    const igAccount = await db
      .select()
      .from(schema.instagramAccount)
      .where(
        and(
          eq(schema.instagramAccount.userId, log.userId),
          eq(sql`lower(${schema.instagramAccount.conta})`, log.conta?.toLowerCase() ?? "")
        )
      )
      .then((rows) => rows[0])

    if (!igAccount) {
      logger.warn(`Conta Instagram "${log.conta}" não encontrada para analytics.`)
      return { skipped: true }
    }

    // Fetch metrics from Instagram
    let metrics
    try {
      metrics = await getPostMetrics(log.instagramPostId, igAccount.pageAccessToken)
    } catch (e) {
      logger.error(`Erro ao buscar métricas do post ${log.instagramPostId}: ${e}`)
      return { error: String(e) }
    }

    // Write metrics back to Notion
    const notion = createNotionClient(connection.accessToken)
    try {
      await notion.updateAnalytics(log.notionPageId, mapping, metrics)
    } catch (e) {
      logger.error(`Erro ao atualizar Notion para post ${log.notionPageId}: ${e}`)
      return { error: String(e) }
    }

    // Mark analytics as updated
    await db
      .update(schema.publishLog)
      .set({ analyticsUpdatedAt: new Date() })
      .where(eq(schema.publishLog.id, logId))

    logger.info(
      `[${log.conta}] "${log.postTitle}" — likes:${metrics.likes} reach:${metrics.reach} saves:${metrics.saves}`
    )
    return { ok: true, metrics }
  },
})
