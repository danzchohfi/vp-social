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
  cron: { pattern: "0 */6 * * *", timezone: "America/Sao_Paulo" },
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
    if (!logs.length) return

    const result = await syncPostAnalytics.batchTriggerAndWait(
      logs.map((log) => ({ payload: { logId: log.id } }))
    )

    const ok = result.runs.filter((r) => r.ok).length
    const err = result.runs.filter((r) => !r.ok).length
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

    // Notion sync is opt-in (requires the agency to have mapped analytics
    // columns). The internal report aggregates always use publish_log,
    // so we still want to fetch + persist metrics even when no Notion
    // mapping exists.
    const hasAnalyticsMapping = !!(
      mapping.likesField || mapping.reachField ||
      mapping.commentsField || mapping.savesField || mapping.impressionsField
    )

    // Get Instagram access token via conta match (scoped by client when available)
    const igAccount = await db
      .select()
      .from(schema.instagramAccount)
      .where(
        and(
          eq(schema.instagramAccount.userId, log.userId),
          eq(sql`lower(${schema.instagramAccount.conta})`, log.conta?.toLowerCase() ?? ""),
          ...(log.clientId ? [eq(schema.instagramAccount.clientId, log.clientId)] : [])
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

    // Write metrics back to Notion when fields are mapped. Failure here
    // shouldn't block the publish_log write below — Notion's our soft
    // surface, the report tables are our hard one.
    if (hasAnalyticsMapping) {
      const notion = createNotionClient(connection.accessToken)
      try {
        await notion.updateAnalytics(log.notionPageId, mapping, metrics)
      } catch (e) {
        logger.error(`Erro ao atualizar Notion para post ${log.notionPageId}: ${e}`)
        // fall through — still persist to publish_log
      }
    }

    // Mirror metrics into publish_log so the monthly report aggregates
    // see them (it queries this table, not Notion).
    await db
      .update(schema.publishLog)
      .set({
        metricsLastSyncedAt: new Date(),
        metricsLikes: metrics.likes,
        metricsComments: metrics.comments,
        metricsReach: metrics.reach,
        metricsSaves: metrics.saves,
        metricsImpressions: metrics.impressions,
      })
      .where(eq(schema.publishLog.id, logId))

    logger.info(
      `[${log.conta}] "${log.postTitle}" — likes:${metrics.likes} reach:${metrics.reach} saves:${metrics.saves}`
    )
    return { ok: true, metrics }
  },
})
