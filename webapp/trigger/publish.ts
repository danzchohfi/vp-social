import { schedules, task, logger } from "@trigger.dev/sdk"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { and, eq, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm"
import * as schema from "../lib/db/schema"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping, type NotionPost } from "../lib/notion"
import { publishToPlatform, saveLog, claimPublishSlot, completePublishSlot, hasPriorPublish, isVideo } from "../lib/publisher"
import { createInstagramPublisher, fetchInstagramPermalink } from "../lib/instagram"
import { probeVideoDurationSec, splitStoryVideo } from "../lib/video-splitter"
import { notifyPublishFailureAsync } from "../lib/email-notifications"
import { validatePhoneE164 } from "../lib/phone"
import { dispatchApprovalRequest, isConfigured, type UserWhatsappConfig } from "../lib/whatsapp-dispatch"
import { generateId } from "../lib/utils"
import { findApproverByPhone } from "../lib/approvers"
import { APPROVAL_TTL_DAYS } from "../lib/approval-link"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://posts.vitaminapublicitaria.com.br"
const STORY_CHUNK_PAUSE_MS = 30_000

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function getDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle(sql, { schema })
}

// Broad heuristic over publish-error strings: are we looking at an
// expired/revoked OAuth token? Pattern covers Meta (code 190, "OAuth"),
// Google ("invalid_grant", "Token has been expired"), TikTok/LinkedIn
// (401/403 status mentions). False positives just nudge the agency to
// reconnect, false negatives let a real token failure stay silent — so
// we err on the side of catching too much.
function isAuthError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes("oauth") ||
    m.includes("access token") ||
    m.includes("token has expired") ||
    m.includes("token expired") ||
    m.includes("token is invalid") ||
    m.includes("invalid_token") ||
    m.includes("invalid_grant") ||
    m.includes("code 190") ||
    m.includes("status 401") ||
    m.includes("status 403") ||
    m.includes("session has expired") ||
    m.includes("revoked")
  )
}

// ─── Scheduled: roda a cada 5 minutos para todos os workspaces ──────

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

    // Fase 10 — sweep de entrega de arquivo. Produções ativas (não
    // archived/published) com notionPageId setado ganham um sync que lê
    // os campos de mídia vertical/horizontal do Notion e atualiza os
    // flags `hasVerticalMedia` / `hasHorizontalMedia` na produção. Isso
    // alimenta o card "📦 Arquivo pronto pra entrega" no portal /a/[token]
    // sem precisar de storage próprio — o download em si resolve URL
    // fresca on-demand via /api/productions/[id]/deliverable.
    try {
      await syncProductionDeliverables.trigger()
    } catch (e) {
      logger.warn(`Sweep de entrega falhou: ${e instanceof Error ? e.message : e}`)
    }
  },
})

// Fase 10 — sweep de produções pra atualizar flags de entrega de arquivo.
// Disparado pelo cron `publishScheduled`. Cada produção ativa com
// notionPageId gera 1 read do Notion (pesa pouco — é 1 req por produção
// por 5min, e só roda em produções não-arquivadas/publicadas).
// Status onde a sync ainda faz sentido. archived/published já estão
// "terminal" — não vale o custo de cada Notion call. brief_pending +
// script_drafting + revision_requested estão incluídos pra capturar o
// status fine-grained do Notion ("Roteiro", "Aguardando Alinhamento"
// etc) que não tem mapeamento 1:1 com nosso enum interno.
const ACTIVE_DELIVERABLE_STATUSES = [
  "brief_pending",
  "script_drafting",
  "awaiting_approval",
  "revision_requested",
  "approved",
  "recording",
  "editing",
  "delivered",
] as const

export const syncProductionDeliverables = task({
  id: "sync-production-deliverables",
  retry: { maxAttempts: 2 },
  run: async () => {
    const db = getDb()
    const targets = await db
      .select()
      .from(schema.production)
      .where(
        and(
          inArray(
            schema.production.status,
            ACTIVE_DELIVERABLE_STATUSES as unknown as string[],
          ),
        ),
      )
    const withPage = targets.filter((p) => !!p.notionPageId)
    if (withPage.length === 0) {
      logger.info("Sweep de entrega: nenhuma produção ativa com Notion page.")
      return { synced: 0 }
    }

    // Group por clientId pra reusar a mesma conexão Notion por cliente.
    const byClient = new Map<string, typeof withPage>()
    for (const p of withPage) {
      const list = byClient.get(p.clientId) ?? []
      list.push(p)
      byClient.set(p.clientId, list)
    }

    let synced = 0
    for (const [clientId, prods] of byClient.entries()) {
      const conns = await db
        .select()
        .from(schema.notionConnection)
        .where(eq(schema.notionConnection.clientId, clientId))
      const conn = conns.find((c) => c.databaseId) ?? conns[0]
      if (!conn) continue
      const [mappingRow] = await db
        .select()
        .from(schema.fieldMapping)
        .where(eq(schema.fieldMapping.connectionId, conn.id))
      const mapping = (mappingRow ?? DEFAULT_MAPPING) as FieldMapping

      const notion = createNotionClient(conn.accessToken)
      const prodStatusField = mapping.productionStatusField?.trim() || "Status (Produção)"
      for (const prod of prods) {
        try {
          const post = await notion.getPostById(prod.notionPageId!, mapping)
          if (!post) continue
          const hasVertical = post.verticalUrls.length > 0
          const hasHorizontal = post.horizontalUrls.length > 0
          // Status fine-grained do Notion: lê SEPARADAMENTE porque o
          // statusField de parsePage é o do POST (publish status),
          // não o de produção. Field name vem do mapping ou default.
          const notionStatus = prodStatusField
            ? await notion.readStatusProperty(prod.notionPageId!, prodStatusField)
            : null
          const allSameAsBefore =
            hasVertical === prod.hasVerticalMedia &&
            hasHorizontal === prod.hasHorizontalMedia &&
            notionStatus === prod.notionStatus
          if (
            allSameAsBefore &&
            prod.deliverableSyncedAt &&
            Date.now() - new Date(prod.deliverableSyncedAt).getTime() < 60 * 60 * 1000
          ) {
            // Estado igual + sync recente (< 1h): pula update pra reduzir writes.
            continue
          }
          await db
            .update(schema.production)
            .set({
              hasVerticalMedia: hasVertical,
              hasHorizontalMedia: hasHorizontal,
              notionStatus,
              notionStatusSyncedAt: new Date(),
              deliverableSyncedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(schema.production.id, prod.id))
          synced++
        } catch (e) {
          logger.warn(
            `Sync deliverable falhou para produção ${prod.id}: ${e instanceof Error ? e.message : e}`,
          )
        }
      }
    }
    logger.info(`Sweep de entrega: ${synced} produções atualizadas.`)
    return { synced }
  },
})

// ─── Task por workspace/conexão ──────────────

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

    // Agency-level WhatsApp config (one WABA per user). Fetched once
    // per connection so we don't N+1 inside the per-post loop. Empty
    // when the user hasn't configured Meta Cloud yet → dispatcher
    // surfaces friendly error per-post.
    const [waConfigRow] = await db
      .select({
        metaWaToken: schema.userWhatsappConfig.metaWaToken,
        metaPhoneNumberId: schema.userWhatsappConfig.metaPhoneNumberId,
        metaTemplateName: schema.userWhatsappConfig.metaTemplateName,
        metaTemplateLanguage: schema.userWhatsappConfig.metaTemplateLanguage,
      })
      .from(schema.userWhatsappConfig)
      .where(eq(schema.userWhatsappConfig.userId, userId))
    const waConfig: UserWhatsappConfig = waConfigRow ?? {
      metaWaToken: null,
      metaPhoneNumberId: null,
      metaTemplateName: null,
      metaTemplateLanguage: "pt_BR",
    }

    // Per-client approval routing: which posts auto-dispatch vs. fall
    // back to manual wa.me, and whether the cron fires per-post or
    // waits for the agency's "Notificar pendentes" click.
    let clientName: string | null = null
    let approvalMode: "auto" | "manual_wame" = "auto"
    let approvalDispatchMode: "auto" | "manual" = "auto"
    if (connection.clientId) {
      const [c] = await db
        .select({
          name: schema.client.name,
          approvalNotificationMode: schema.client.approvalNotificationMode,
          approvalDispatchMode: schema.client.approvalDispatchMode,
          publishingPaused: schema.client.publishingPaused,
        })
        .from(schema.client)
        .where(eq(schema.client.id, connection.clientId))
      if (c?.publishingPaused) {
        logger.info(`[paused] cliente "${c.name}" — publicações pausadas, pulando este tick.`)
        return { published: 0, failed: 0, skipped: 0 }
      }
      clientName = c?.name ?? null
      // 'manual_whatsapp' = legacy mode name; preserved here to keep
      // existing rows working. New rows write 'manual_wame'.
      if (c?.approvalNotificationMode === "manual_whatsapp" || c?.approvalNotificationMode === "manual_wame") {
        approvalMode = "manual_wame"
      }
      if (c?.approvalDispatchMode === "manual") {
        approvalDispatchMode = "manual"
      }
    }

    const [mappingRow] = await db
      .select()
      .from(schema.fieldMapping)
      .where(eq(schema.fieldMapping.connectionId, connectionId))

    const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING

    const notion = createNotionClient(connection.accessToken)

    // Approval sweep — runs before the publish sweep so that if a post has
    // already been approved (status flipped to ready) we publish it on the
    // same tick instead of waiting another 5 min. Opt-in: only runs when
    // mapping.awaitingApprovalValue is configured.
    if (mapping.awaitingApprovalValue && connection.clientId) {
      try {
        await runApprovalSweep({
          db,
          notion,
          connectionId,
          clientId: connection.clientId,
          clientName,
          userId,
          mapping,
          approvalMode,
          approvalDispatchMode,
          waConfig,
        })
      } catch (e) {
        logger.error(`Falha no approval sweep (workspace ${connection.workspaceName}): ${e}`)
      }
    }

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
        // Flip status to Erro so the cron filter stops matching this post.
        // Without the flip, the same post is logged "skipped" every 5 min.
        try {
          await notion.markFailed(post.pageId, mapping)
        } catch (e) {
          logger.warn(`Falha ao marcar erro no Notion para "${post.title}" (sem publishTargets): ${e}`)
        }
        results.skipped++
        continue
      }

      // ─── Page-level dedup ────────────────────────────────────────
      // If ANY successful publish_log row already exists for this post on
      // this connection, we refuse to process any of its targets and
      // instead try to flip the Notion status (recovery). This is the
      // strongest defense against duplicate publishes — it doesn't rely
      // on the per-target unique index holding. When the user manually
      // triggers a retry via /api/posts/retry, that path is unaffected:
      // retry only flips Notion status to ready; it doesn't delete
      // publish_log rows. If they actually want to republish, they need
      // a fresh Notion page (duplicate the page) — there's no UX path
      // that justifies overwriting a successful publish silently.
      if (await hasPriorPublish(db, connectionId, post.pageId)) {
        logger.warn(`Post "${post.title}" (${post.pageId}) já tem publicações anteriores em publish_log. Pulando para evitar duplicata e tentando recuperar status no Notion.`)
        try {
          await notion.markPublished(post.pageId, mapping)
          logger.info(`Status Notion recuperado para "${post.title}".`)
        } catch (e) {
          logger.error(`CRÍTICO: post "${post.title}" tem publishes prévios mas markPublished falhou (${e instanceof Error ? e.message : e}). Cron vai pular este post nos próximos ticks também — investigue a configuração do statusField/statusPublishedValue no Notion.`)
        }
        results.skipped++
        continue
      }

      // Track per-post outcome so we can flip the Notion page status to
      // Publicado/Erro at the end. Without this, the cron republishes the
      // same post every 5 minutes because the filter still matches.
      let anyPublished = false
      let anyFailed = false
      // True when the idempotency pre-check found a target already
      // published in a previous run. Triggers a recovery markPublished
      // so the cron stops re-matching this post.
      let anyPreviouslyDone = false
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

        // ─── Special case: Instagram Story with video > 60s ────────
        // IG caps Stories at 60s (error 2207082). Probe duration; if longer,
        // slice into chunks via ffmpeg, upload each to Vercel Blob, publish
        // sequentially with a 30s pause. Each chunk gets its own claim/log
        // pair under platform="Instagram Story 1/3" so retries don't re-
        // upload chunks that already landed on IG.
        const tipoLower = target.tipo.toLowerCase().trim()
        const storyVideoUrl = (target.platform === "instagram" && tipoLower === "story") ? post.verticalUrls[0] : null
        if (storyVideoUrl && isVideo(storyVideoUrl)) {
          let duration = 0
          try {
            duration = await probeVideoDurationSec(storyVideoUrl)
          } catch (e) {
            logger.warn(`[${target.raw}/${post.conta}] probe falhou (${e instanceof Error ? e.message : e}); seguindo para publish direto.`)
          }
          if (duration > 60) {
            logger.info(`[${target.raw}/${post.conta}] Story de ${Math.round(duration)}s — fatiando em chunks de 60s.`)
            let splitResult: Awaited<ReturnType<typeof splitStoryVideo>> | null = null
            try {
              splitResult = await splitStoryVideo(storyVideoUrl)
              const igPub = createInstagramPublisher(account.instagramBusinessAccountId, account.pageAccessToken)
              for (let i = 0; i < splitResult.chunks.length; i++) {
                if (i > 0) await sleep(STORY_CHUNK_PAUSE_MS)
                const c = splitResult.chunks[i]
                const chunkRaw = `${target.raw} ${c.index}/${c.total}`
                // Each chunk gets its own claim so a retry after a worker crash
                // doesn't re-publish chunks that already landed on IG.
                const chunkClaim = await claimPublishSlot(db, userId, connectionId, post, chunkRaw, connection.clientId)
                if ("conflict" in chunkClaim) {
                  logger.warn(`[${chunkRaw}/${post.conta}] chunk já publicado ou em curso por outro worker — pulando.`)
                  anyPreviouslyDone = true
                  results.skipped++
                  continue
                }
                try {
                  // Upload bytes direto pro IG via resumable upload — sem
                  // intermediário (Vercel Blob etc.) que precise ser público.
                  const chunkBytes = await splitResult.readChunk(c)
                  const igId = await igPub.publishStoryVideoFromBuffer(chunkBytes)
                  const igPermalink = await fetchInstagramPermalink(igId, account.pageAccessToken)
                  await completePublishSlot(db, chunkClaim.rowId, chunkRaw, "published", igId, igPermalink, null)
                  if (igPermalink) publishedLinks.push({ platform: chunkRaw, url: igPermalink })
                  logger.info(`[${chunkRaw}/${post.conta}] ✓ chunk publicado: ${igId}`)
                  results.published++
                  anyPublished = true
                } catch (chunkErr) {
                  const message = chunkErr instanceof Error ? chunkErr.message : String(chunkErr)
                  logger.error(`[${chunkRaw}/${post.conta}] ✗ ${message}`)
                  await completePublishSlot(db, chunkClaim.rowId, chunkRaw, "failed", null, null, message)
                  notifyPublishFailureAsync(userId, clientName, { postTitle: post.title, conta: post.conta, platform: chunkRaw, error: message })
                  results.failed++
                  anyFailed = true
                }
              }
              continue
            } catch (splitErr) {
              const message = splitErr instanceof Error ? splitErr.message : String(splitErr)
              logger.error(`[${target.raw}/${post.conta}] split falhou: ${message}`)
              await saveLog(db, userId, connectionId, post, null, null, target.raw, "failed", `Falha ao fatiar vídeo do Story: ${message}`, connection.clientId)
              notifyPublishFailureAsync(userId, clientName, { postTitle: post.title, conta: post.conta, platform: target.raw, error: message })
              results.failed++
              anyFailed = true
              continue
            } finally {
              // tmpdir cleanup: harmless if split itself failed before the dir
              // existed (cleanup is a no-op in that case).
              if (splitResult) await splitResult.cleanup()
            }
          }
        }

        // Atomic claim before calling the external API. The unique partial
        // index on (connection, page, platform) WHERE status IN ('published',
        // 'pending') makes the INSERT race-free: two workers fighting for
        // the same target → only one gets the slot, the other gets a
        // unique-violation and skips.
        const claim = await claimPublishSlot(db, userId, connectionId, post, target.raw, connection.clientId)
        if ("conflict" in claim) {
          logger.warn(`[${target.raw}] "${post.title}" — slot já reservado por outro worker (ou já publicado), pulando.`)
          anyPreviouslyDone = true
          results.skipped++
          continue
        }

        try {
          const { id: postId, url: postUrl } = await publishToPlatform(target.platform, target.tipo, account, post)
          await completePublishSlot(db, claim.rowId, target.raw, "published", postId, postUrl, null)
          if (postUrl) publishedLinks.push({ platform: target.raw, url: postUrl })
          logger.info(`[${target.raw}/${post.conta}] ✓ "${post.title}" publicado! ID: ${postId}${postUrl ? ` URL: ${postUrl}` : ""}`)
          // Successful publish proves the token works — clear any prior
          // refresh-error flag so the dashboard banner stops nagging.
          if (account.lastRefreshError) {
            await db
              .update(schema.instagramAccount)
              .set({ lastRefreshError: null, lastRefreshErrorAt: null })
              .where(eq(schema.instagramAccount.id, account.id))
              .catch(() => {})
          }
          results.published++
          anyPublished = true
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.error(`[${target.raw}/${post.conta}] ✗ "${post.title}": ${message}`)
          await completePublishSlot(db, claim.rowId, target.raw, "failed", null, null, message)
          // Fire-and-forget email — never blocks the publish loop.
          notifyPublishFailureAsync(userId, clientName, {
            postTitle: post.title,
            conta: post.conta,
            platform: target.raw,
            error: message,
          })
          // When the failure looks like an expired/revoked token, mark
          // the account so the /dashboard banner can surface "reconectar"
          // before the next publish cycle. Heuristic on common auth
          // error shapes across IG/FB/YT/TT/LI — broad on purpose, false
          // positives just nudge an unnecessary reconnect.
          if (isAuthError(message)) {
            await db
              .update(schema.instagramAccount)
              .set({ lastRefreshError: message.slice(0, 500), lastRefreshErrorAt: new Date() })
              .where(eq(schema.instagramAccount.id, account.id))
              .catch((e) => logger.warn(`[auth] não consegui marcar lastRefreshError em ${account.id}: ${e}`))
          }
          results.failed++
          anyFailed = true
        }
      }

      // CRITICAL: status flip is what removes the post from the "ready"
      // filter. It MUST run before link writeback — if setPostUrls fails
      // (Notion API 5xx, wrong field type, integration access removed),
      // the unhandled throw used to skip the status flip and the cron
      // would republish the same post every 5 min.
      // Recovery case: if the pre-check skipped everything because the
      // post was already published in an earlier run, also flip to
      // Publicado so the post leaves the ready filter.
      try {
        if (anyPublished || anyPreviouslyDone) await notion.markPublished(post.pageId, mapping)
        else if (anyFailed) await notion.markFailed(post.pageId, mapping)
      } catch (e) {
        logger.error(`CRÍTICO: falha ao flipar status no Notion para "${post.title}" — pode reproduzir em 5min: ${e}`)
      }

      // Link writeback is best-effort cosmetic. Even if it throws, the
      // status was already flipped so the post won't be republished.
      if (publishedLinks.length > 0) {
        try {
          await notion.setPostUrls(post.pageId, mapping, publishedLinks)
        } catch (e) {
          logger.warn(`Falha ao escrever links no Notion para "${post.title}": ${e}`)
        }
      }
    }

    return results
  },
})

// ─── Approval sweep helper ─────────────────────────
// Detects posts in mapping.awaitingApprovalValue, creates approvalLink
// rows for new ones, and notifies the client via ManyChat (WhatsApp
// only — email was explicitly cut). Idempotent on the partial unique
// index (notionPageId) WHERE decision IS NULL: re-running on the next
// tick won't double-notify a post that's still pending. When ManyChat
// can't deliver, sentVia="none" and agency uses the click-to-chat WA
// button manually from /scheduled.

type SweepArgs = {
  db: ReturnType<typeof getDb>
  notion: ReturnType<typeof createNotionClient>
  connectionId: string
  clientId: string
  clientName: string | null
  // Agency owner — used to look up an existing Approver by phone so
  // post approvalLinks get the same approverId as production chains.
  // Unifies the /a/[token] magic-link portal across both kinds.
  userId: string
  mapping: FieldMapping
  // Per-client routing. 'manual_wame' = skip Meta dispatch entirely; agency
  // uses the click-to-chat WA button on /scheduled. 'auto' = cron dispatches
  // via Meta Cloud per-post, falling back to sentVia='none' if creds missing
  // or API rejects.
  approvalMode: "auto" | "manual_wame"
  // When 'manual', cron creates the approvalLink but does NOT dispatch.
  // Agency triggers via /api/clients/[id]/notify-pending later.
  approvalDispatchMode: "auto" | "manual"
  // Agency-level Meta Cloud config (one WABA per user).
  waConfig: UserWhatsappConfig
}

async function runApprovalSweep(a: SweepArgs): Promise<void> {
  const { db, notion, connectionId, clientId, clientName, userId, mapping, approvalMode, approvalDispatchMode, waConfig } = a
  if (!mapping.awaitingApprovalValue) return
  const connection = await db
    .select()
    .from(schema.notionConnection)
    .where(eq(schema.notionConnection.id, connectionId))
    .then((r) => r[0])
  if (!connection?.databaseId) return

  const posts = await notion.getPostsByStatus(connection.databaseId, mapping, mapping.awaitingApprovalValue)
  logger.info(`${posts.length} post(s) aguardando aprovação no workspace ${connection.workspaceName}.`)

  // Expire stale pending links: any approvalLink for this client+connection
  // with decision IS NULL whose Notion post is no longer in the awaiting
  // status. Reasons this happens:
  //   - Agency moved the status back to "Rascunho" / "Aprovado" via Notion
  //     directly (bypassing /approve)
  //   - Approval was decided through the chain editor or admin tool
  //   - Old test rows from when awaitingApprovalValue or contact resolution
  //     was misconfigured
  // Without this cleanup, /dashboard pendingByClient counted 10 when the
  // user only saw 1 truly awaiting in Notion (2026-05-12 report).
  // Note: we only flip rows where sentVia is null/'none' — any link we
  // actually sent (sentVia='meta_cloud'|'manual') keeps its WhatsApp URL
  // valid so the recipient can still decide if they click it.
  try {
    const awaitingIds = new Set(posts.map((p) => p.pageId))
    const existing = await db
      .select({
        id: schema.approvalLink.id,
        notionPageId: schema.approvalLink.notionPageId,
        sentVia: schema.approvalLink.sentVia,
      })
      .from(schema.approvalLink)
      .where(and(
        // Scope by connectionId only — clientId now varies per conta
        // (resolveOwnerClient), so locking to the cron's connection
        // is the right boundary for this sweep's cleanup.
        eq(schema.approvalLink.connectionId, connectionId),
        eq(schema.approvalLink.kind, "post"),
        isNull(schema.approvalLink.decision),
      ))
    const orphanIds: string[] = existing
      .filter((r) => r.notionPageId && !awaitingIds.has(r.notionPageId))
      .filter((r) => r.sentVia === "none" || r.sentVia === "invalid_phone" || !r.sentVia)
      .map((r) => r.id)
    if (orphanIds.length > 0) {
      await db
        .update(schema.approvalLink)
        .set({ decision: "expired", decidedAt: new Date() })
        .where(inArray(schema.approvalLink.id, orphanIds))
      logger.info(`[approval] expired ${orphanIds.length} órfão(s) — posts saíram do status de aprovação no Notion`)
    }
  } catch (e) {
    logger.warn(`[approval] cleanup orphan links failed: ${e instanceof Error ? e.message : e}`)
  }

  if (!posts.length) return

  // Build a conta → ownerClientId map across all clients accessible to
  // this agency owner. Without this, every approvalLink gets the cron's
  // connection.clientId regardless of which conta the post belongs to —
  // so when the same Notion DB serves multiple client tenants (Conta
  // "Marca A" → client A, "Marca B" → client B), all approvalLinks end
  // up tagged with whichever client owns the notionConnection. User
  // reported in 2026-05-12: dashboard "Detalhes" pulled posts from
  // every conta with awaiting status, not just the active client's.
  //
  // Match priority (mirrors /api/notion/scheduled findExplicitOwner):
  //   1. Client name (case-insensitive) === conta
  //   2. Client.notionContaValues contains conta
  // Posts whose conta matches no client → fall back to connection.clientId
  // (legacy behavior; ensures we don't drop posts when an account is
  // configured but not yet linked to its own client row).
  const allClients = await db
    .select({
      id: schema.client.id,
      name: schema.client.name,
      notionContaValues: schema.client.notionContaValues,
    })
    .from(schema.client)
    .where(eq(schema.client.userId, userId))
  // Returns the clientId that "owns" a given conta value, or null if
  // no client claims it. Strict mode: if no client matches AND the
  // connection's owner client has notionContaValues set, we refuse to
  // fall back — that signals "this client only handles these
  // specific contas". Posts with unclaimed contas get skipped so the
  // user inside client X doesn't see posts from brand Y in their
  // dashboard. Permissive fallback only when the connection owner
  // hasn't claimed any contas (legacy setups before #90).
  function resolveOwnerClient(contaRaw: string | null | undefined): string | null {
    const conta = (contaRaw ?? "").trim().toLowerCase()
    if (!conta) return null
    // Single source of truth: explicit notionContaValues claim. Name-based
    // matching was removed in #91 — the agency must explicitly tell the
    // app "this client handles these contas" in /settings → Contas do
    // Notion mapeadas. Avoids the ambiguity of "Vitamina" (client) vs
    // "vitamina" (conta) vs "Vitamina Publicitária" (client name).
    for (const c of allClients) {
      const claims = c.notionContaValues ?? []
      if (claims.some((v) => v.trim().toLowerCase() === conta)) return c.id
    }
    const connectionOwner = allClients.find((c) => c.id === clientId)
    const ownerHasClaims = (connectionOwner?.notionContaValues ?? []).length > 0
    if (ownerHasClaims) {
      // Strict: owner has claims and this conta isn't among them.
      return null
    }
    // Permissive legacy fallback: owner has no claims configured →
    // funnel everything to the connection's owner (old behavior).
    return clientId
  }

  // Re-route existing pending links that were created with the wrong
  // clientId before this routing logic existed. Match each pending
  // link's notionPageId against the current sweep's posts; if the
  // post's conta resolves to a different owner, update the row's
  // clientId. Idempotent: subsequent runs see clientId already matches
  // and write nothing.
  try {
    const postsByPageId = new Map(posts.map((p) => [p.pageId, p]))
    const existingForReroute = await db
      .select({
        id: schema.approvalLink.id,
        clientId: schema.approvalLink.clientId,
        notionPageId: schema.approvalLink.notionPageId,
      })
      .from(schema.approvalLink)
      .where(and(
        eq(schema.approvalLink.connectionId, connectionId),
        eq(schema.approvalLink.kind, "post"),
        isNull(schema.approvalLink.decision),
      ))
    for (const row of existingForReroute) {
      if (!row.notionPageId) continue
      const matchingPost = postsByPageId.get(row.notionPageId)
      if (!matchingPost) continue
      const correctOwner = resolveOwnerClient(matchingPost.conta)
      if (!correctOwner) {
        // Conta isn't claimed by any client + connection owner has its
        // own claims set → strict mode says "this post isn't for any
        // current client". Expire the orphan link so it stops polluting
        // the dashboard pending count.
        await db
          .update(schema.approvalLink)
          .set({ decision: "expired", decidedAt: new Date() })
          .where(eq(schema.approvalLink.id, row.id))
        logger.info(`[approval] expired orphan approvalLink ${row.id} (conta="${matchingPost.conta}" não reivindicada por nenhum cliente)`)
        continue
      }
      const correctConta = matchingPost.conta || null
      const patch: { clientId?: string; conta?: string | null } = {}
      if (correctOwner !== row.clientId) patch.clientId = correctOwner
      if ((row as any).conta !== correctConta) patch.conta = correctConta
      if (Object.keys(patch).length > 0) {
        await db
          .update(schema.approvalLink)
          .set(patch)
          .where(eq(schema.approvalLink.id, row.id))
        logger.info(`[approval] re-routed approvalLink ${row.id}: ${JSON.stringify(patch)} (conta="${matchingPost.conta}")`)
      }
    }
  } catch (e) {
    logger.warn(`[approval] reroute pass failed: ${e instanceof Error ? e.message : e}`)
  }

  // Time-based release: links que passaram do TTL e NÃO são candidatos a
  // aprovação tácita (sentVia != 'meta_cloud') ficam como decision='expired'
  // pra liberar o partial unique index e permitir um novo link no mesmo ciclo.
  // Pra sentVia='meta_cloud', o cron separado tacitApprovalSweep cuida via
  // decideApprovalLink mode='tacit' (silêncio = aprovado).
  const now = new Date()
  const expiredRelease = await db
    .update(schema.approvalLink)
    .set({ decision: "expired", decidedAt: now })
    .where(and(
      eq(schema.approvalLink.connectionId, connectionId),
      isNull(schema.approvalLink.decision),
      lt(schema.approvalLink.expiresAt, now),
      ne(schema.approvalLink.sentVia, "meta_cloud"),
    ))
    .returning({ id: schema.approvalLink.id, postTitle: schema.approvalLink.postTitle })
  if (expiredRelease.length > 0) {
    logger.warn(`Liberou ${expiredRelease.length} link(s) de aprovação não-meta (manual/none) expirado(s) — vai recriar no mesmo ciclo.`)
  }

  for (const post of posts) {
    // Idempotency check: a pending link already exists → cron already
    // notified, don't spam. The unique partial index in schema would
    // reject the INSERT anyway, but checking first avoids the noise.
    const existing = await db
      .select({ id: schema.approvalLink.id })
      .from(schema.approvalLink)
      .where(and(
        eq(schema.approvalLink.notionPageId, post.pageId),
        isNull(schema.approvalLink.decision),
      ))
      .limit(1)
    if (existing.length > 0) continue

    // Resolve contact via Notion relation (clientContactField → Contato
    // page → email/phone). Returns null when relation isn't configured or
    // empty; returns object with all-nulls when contact row exists but
    // lacks email/phone.
    const contact = await notion.resolveContact(post.pageId, mapping)
    if (!contact) {
      logger.warn(`Post "${post.title}" sem relação de Contato configurada/preenchida no Notion — pulei.`)
      continue
    }
    if (!contact.email && !contact.phone) {
      logger.warn(`Post "${post.title}" tem relação de Contato mas a página ${contact.name ? `"${contact.name}"` : ""} não tem email nem WhatsApp — pulei.`)
      continue
    }
    if (contact.multipleContacts) {
      logger.warn(`Post "${post.title}" tem múltiplos contatos vinculados na relação — usando o primeiro (${contact.name ?? contact.phone ?? contact.email}).`)
    }

    const token = generateId() + generateId().replace(/-/g, "")
    const approvalUrl = `${APP_URL}/approve/${token}`

    // Try to link this post approvalLink to an existing Approver row
    // matched by phone (digits-normalized). When matched, the same
    // person's magic-link portal at /a/<token> surfaces this post
    // alongside their productions — the "unified approver" Wave 3
    // promise. No match → approverId stays null and the post-only
    // WhatsApp flow runs as before.
    const matchedApprover = await findApproverByPhone(db, userId, contact.phone)
    if (matchedApprover) {
      logger.info(`[approval] post "${post.title}" linked to approver ${matchedApprover.id} (${matchedApprover.name}) via phone match`)
    }

    // Resolve the TRUE owner client by the post's conta. Skips the
    // post entirely if no client claims this conta — prevents posts
    // for brand A from showing in client B's dashboard when the user
    // is inside B's view.
    const ownerClientId = resolveOwnerClient(post.conta)
    if (!ownerClientId) {
      logger.warn(`[approval] post "${post.title}" (conta="${post.conta}") sem cliente reivindicando esta conta — pulando aprovação. Adicione a conta em /settings → Contas do Notion mapeadas do cliente certo, ou crie um cliente com esse nome.`)
      continue
    }
    if (ownerClientId !== clientId) {
      logger.info(`[approval] post "${post.title}" (conta="${post.conta}") roteado pra cliente ${ownerClientId} (não ${clientId} do connection)`)
    }

    const linkRow = {
      id: generateId(),
      token,
      clientId: ownerClientId,
      connectionId,
      notionPageId: post.pageId,
      postTitle: post.title || "Sem título",
      conta: post.conta || null,
      contactName: contact.name,
      contactEmail: contact.email,
      contactPhone: contact.phone,
      approverId: matchedApprover?.id ?? null,
      sentVia: "none" as const,
      sentAt: null as Date | null,
      expiresAt: new Date(Date.now() + APPROVAL_TTL_DAYS * 24 * 60 * 60 * 1000),
    }

    // Insert with onConflictDoNothing on the partial unique index.
    // Concurrent ticks would race; the index ensures only one wins.
    try {
      await db.insert(schema.approvalLink).values(linkRow).onConflictDoNothing()
    } catch (e) {
      logger.warn(`Falha ao criar approvalLink para "${post.title}": ${e}`)
      continue
    }

    // Decide how to notify based on the client's approvalMode setting.
    //   manual_wame → skip Meta dispatch entirely. Mark sentVia='manual'
    //                 so the UI knows this is an intended state, not a
    //                 misconfiguration. Agency sees the row in /scheduled
    //                 with a "Enviar via WA" wa.me button.
    //   auto        → try Meta Cloud. On failure or missing creds, fall
    //                 back to sentVia='none' and the agency manually nudges
    //                 via the same click-to-chat button.
    // 'invalid_phone' = dispatch was skipped because the contact's phone
    // in the Notion DB doesn't look like a real E.164 number. UI surfaces
    // this clearly in /scheduled so the agency knows to fix the Contato
    // page (vs. silent "not found").
    let sentVia: "meta_cloud" | "manual" | "invalid_phone" | "none" = "none"
    // Captures why the dispatch didn't fire (or did, but failed).
    // Surfaces in /scheduled so the agency sees the actual cause
    // without having to open Trigger.dev worker logs.
    let lastError: string | null = null

    // Pre-flight phone validation. We only call this when there's
    // actually a phone — when phone is null, the existing "no phone"
    // warning path below handles it.
    let phoneIssue: string | null = null
    if (contact.phone) {
      const v = validatePhoneE164(contact.phone)
      if (!v.valid) phoneIssue = v.reason
    }

    if (approvalDispatchMode === "manual") {
      lastError = "Modo manual ativo — clique 'Notificar pendentes' no /dashboard pra disparar"
      logger.info(`[approval] dispatch manual: link criado para "${post.title}", aguardando agência clicar "Notificar pendentes"`)
    } else if (approvalMode === "manual_wame") {
      sentVia = "manual"
      logger.info(`[approval] modo manual: link gerado para "${post.title}" — agência envia via wa.me em /scheduled`)
    } else if (phoneIssue) {
      sentVia = "invalid_phone"
      lastError = `Telefone inválido (${contact.phone}): ${phoneIssue}`
      logger.warn(`[approval] telefone inválido pra "${post.title}" (${contact.phone}): ${phoneIssue}. Agência precisa corrigir a página Contato no Notion.`)
    } else if (!isConfigured(waConfig)) {
      // Sem token/phone/template Meta salvos pelo owner em /settings, o
      // cron degrada silenciosamente pra manual — agency manda via wa.me
      // em /scheduled. Sem log de erro no /history (não é erro, é "ainda
      // não configurado"). Quando o owner configurar, o tick seguinte
      // pula esse branch e cai em dispatchApprovalRequest naturalmente.
      sentVia = "manual"
      logger.info(`[approval] sem config Meta — link "${post.title}" marcado como manual, agency envia via wa.me`)
    } else if (contact.phone) {
      // Meta Cloud dispatch. waConfig is agency-level (one WABA per
      // user). When unconfigured, dispatcher returns ok=false with a
      // friendly reason — surface in /history same as a real send fail.
      const result = await dispatchApprovalRequest({
        config: waConfig,
        phone: contact.phone,
        contactName: contact.name,
        postTitle: post.title || "",
        approvalUrl,
      })
      if (result.ok) {
        sentVia = "meta_cloud"
        lastError = null
        logger.info(`[approval] meta_cloud enviado para ${contact.phone} (${post.title})`)
      } else {
        lastError = result.reason
        logger.warn(`[approval] meta_cloud falhou para "${post.title}": ${result.reason}`)
        // Surface the dispatch failure in /history so the agency
        // doesn't have to dig through Trigger.dev logs to see
        // "template not approved" or "phone not in allowed list".
        // platform="aprovação" disambiguates this row from real
        // publish failures.
        await saveLog(db, userId, connectionId, post, null, null, "aprovação", "failed", lastError, ownerClientId)
      }
    } else if (!contact.phone) {
      lastError = "Contato resolvido sem telefone — verifique a página Contato no Notion"
      logger.warn(`[approval] Contato sem telefone — agência precisa enviar manualmente via /scheduled`)
    }

    if (sentVia === "none") {
      logger.warn(`[approval] Notificação automática não funcionou para "${post.title}" — agência precisa enviar manualmente`)
    }

    // clientName is referenced for logging context downstream; reading
    // it here keeps the SweepArgs interface honest for future use.
    void clientName

    await db
      .update(schema.approvalLink)
      .set({
        sentVia,
        sentAt: (sentVia === "none" || sentVia === "invalid_phone") ? null : new Date(),
        lastError,
      })
      .where(eq(schema.approvalLink.token, token))

    // Audit trail in Notion: every approval request leaves a comment
    // on the post so anyone scrolling the page can see "aprovação foi
    // pedida em <date> via WhatsApp pra <contact>" without going to
    // /scheduled. Best-effort — wrapped in postSystemComment which
    // soft-fails on Notion permission errors.
    const recipient = contact.name ?? contact.phone ?? "contato"
    const reqLabel =
      sentVia === "meta_cloud" ? `via WhatsApp pra ${recipient}`
        : sentVia === "manual" ? `— agência envia via WhatsApp pra ${recipient}`
          : sentVia === "invalid_phone" ? `— ⚠ telefone inválido (${contact.phone ?? "vazio"}); corrigir contato no Notion`
            : `— ⚠ envio automático falhou; agência precisa enviar manualmente`
    await notion.postSystemComment(
      post.pageId,
      `🔔 Aprovação solicitada ${reqLabel} · ${new Date().toLocaleString("pt-BR")}`,
    )
  }
}

// ─── Cleanup stale pending publish-log rows ──────────────────
// Pending rows are slot-claims taken by claimPublishSlot. Under normal
// operation a worker either succeeds (UPDATE → 'published') or fails
// (UPDATE → 'failed') within seconds. If the worker process dies between
// the claim and the terminal update — Trigger.dev kill, OOM, ECS task
// reschedule, network drop in the middle of a long video upload — the
// pending row would stick forever and block all future retries (the
// unique index keeps the slot reserved).
//
// This sweep marks any pending row older than 10 min as 'failed' with
// a note, releasing the slot for retry. 10 min is comfortably above the
// longest legitimate publish (a few-minute Reel + IG container processing)
// while short enough that a real crash is recoverable in one cron cycle.
export const cleanupStalePending = schedules.task({
  id: "cleanup-stale-pending-publish-logs",
  cron: "*/10 * * * *",
  run: async () => {
    const db = getDb()
    const cutoff = new Date(Date.now() - 10 * 60 * 1000)
    const stale = await db
      .update(schema.publishLog)
      .set({
        status: "failed",
        error: "Worker abandonou o publish (pending sem terminal por 10min). A publicação externa pode ou não ter completado — verifique manualmente.",
      })
      .where(and(
        eq(schema.publishLog.status, "pending"),
        lt(schema.publishLog.publishedAt, cutoff),
      ))
      .returning({
        id: schema.publishLog.id,
        postTitle: schema.publishLog.postTitle,
        platform: schema.publishLog.platform,
      })
    if (stale.length > 0) {
      logger.warn(`Marcou ${stale.length} pending row(s) stale como failed: ${stale.map((s) => `"${s.postTitle}"/${s.platform}`).join(", ")}`)
    }
  },
})

// ─── Magic token expiry backfill ─────────────────────────────
// Diariamente: aprovadores existentes pré-MED-4 ficaram com
// magic_token_expires_at=NULL (sem TTL). Sem backfill, o fix do MED-4
// efetivamente só vale pra rows novos. Esse cron pega magicTokenIssuedAt
// e seta expiresAt = issuedAt + 365d. Rows novos já vêm preenchidos
// pela lib/approvers, então uma vez backfilled o cron vira no-op.
// Roda diário pra também cobrir o caso raro de alguém inserir row via
// SQL direto.
export const backfillMagicTokenExpiry = schedules.task({
  id: "backfill-magic-token-expiry",
  cron: "30 3 * * *", // 03:30 UTC todo dia
  run: async () => {
    const db = getDb()
    const TTL_MS = 365 * 24 * 60 * 60 * 1000
    const rows = await db
      .select({ id: schema.approver.id, magicTokenIssuedAt: schema.approver.magicTokenIssuedAt })
      .from(schema.approver)
      .where(isNull(schema.approver.magicTokenExpiresAt))
    if (rows.length === 0) {
      logger.info("backfillMagicTokenExpiry: nada pra backfill")
      return
    }
    for (const r of rows) {
      const issued = r.magicTokenIssuedAt ?? new Date()
      const expires = new Date(issued.getTime() + TTL_MS)
      await db
        .update(schema.approver)
        .set({ magicTokenExpiresAt: expires })
        .where(eq(schema.approver.id, r.id))
    }
    logger.info(`backfillMagicTokenExpiry: backfilled ${rows.length} approvers`)
  },
})

// ─── Production-approval stale-link reminders ───────────────────
// Daily 9am São Paulo: nudges any production-script approval link
// that's been sitting pending for >3 days without a decision. Sends
// the same Meta Cloud template as the original dispatch but tags the
// row with reminderSentAt so each link only gets ONE reminder (no spam
// loop). The agency can still bump the round manually if 6+ days
// pass — that creates a new approvalLink and resets the cycle.
//
// Cap: 1 reminder per link. We could escalate (3d → email → 7d →
// SMS) but that's premature; the simple nudge solves the common
// case where the approver lost the WA message in their flood.
export const productionApprovalReminders = schedules.task({
  id: "production-approval-reminders",
  cron: { pattern: "0 9 * * *", timezone: "America/Sao_Paulo" },
  run: async () => {
    const db = getDb()
    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

    // Pull candidates: production-script links, no decision, sent
    // >3d ago, not expired, no prior reminder. We don't filter by
    // approverId here — we batch-fetch the join data after.
    const stale = await db
      .select()
      .from(schema.approvalLink)
      .where(and(
        eq(schema.approvalLink.kind, "production_script"),
        isNull(schema.approvalLink.decision),
        isNull(schema.approvalLink.reminderSentAt),
        lt(schema.approvalLink.sentAt, threeDaysAgo),
      ))

    const live = stale.filter((row) => row.expiresAt > now)
    if (live.length === 0) {
      logger.info("[reminders] nenhum link parado, nada a fazer")
      return
    }

    logger.info(`[reminders] ${live.length} link(s) parado(s) há 3+ dias — disparando lembretes`)

    let sent = 0
    let skipped = 0
    // Cache the agency owner's WhatsApp config by userId — multiple
    // links from the same agency share the same WABA. Saves a query
    // per row when the cron processes a batch from one agency.
    const waConfigByUser = new Map<string, UserWhatsappConfig>()
    for (const row of live) {
      try {
        if (!row.approverId) {
          skipped++
          continue
        }
        const [approver] = await db
          .select({ name: schema.approver.name, phone: schema.approver.phone })
          .from(schema.approver)
          .where(eq(schema.approver.id, row.approverId))
        if (!approver?.phone) {
          skipped++
          continue
        }
        const [c] = await db
          .select({ userId: schema.client.userId })
          .from(schema.client)
          .where(eq(schema.client.id, row.clientId))
        if (!c) {
          skipped++
          continue
        }
        let config = waConfigByUser.get(c.userId)
        if (!config) {
          const [cfg] = await db
            .select({
              metaWaToken: schema.userWhatsappConfig.metaWaToken,
              metaPhoneNumberId: schema.userWhatsappConfig.metaPhoneNumberId,
              metaTemplateName: schema.userWhatsappConfig.metaTemplateName,
              metaTemplateLanguage: schema.userWhatsappConfig.metaTemplateLanguage,
            })
            .from(schema.userWhatsappConfig)
            .where(eq(schema.userWhatsappConfig.userId, c.userId))
          config = cfg ?? {
            metaWaToken: null,
            metaPhoneNumberId: null,
            metaTemplateName: null,
            metaTemplateLanguage: "pt_BR",
          }
          waConfigByUser.set(c.userId, config)
        }

        const dispatch = await dispatchApprovalRequest({
          config,
          phone: approver.phone,
          contactName: approver.name,
          postTitle: row.postTitle,
          approvalUrl: `${APP_URL}/approve/${row.token}`,
        })

        // Mark the row even if dispatch failed — we don't want to retry
        // forever. Failure log + agency manual nudge via /scheduled is
        // the recovery path, same as the initial-dispatch flow.
        await db
          .update(schema.approvalLink)
          .set({ reminderSentAt: new Date() })
          .where(eq(schema.approvalLink.id, row.id))

        if (dispatch.ok) {
          sent++
          logger.info(`[reminders] ✓ "${row.postTitle}" → ${approver.name} (${approver.phone})`)
        } else {
          skipped++
          logger.warn(`[reminders] Meta Cloud falhou pra "${row.postTitle}": ${dispatch.reason}`)
        }
      } catch (e) {
        skipped++
        logger.error(`[reminders] erro inesperado processando ${row.id}: ${e}`)
      }
    }

    logger.info(`[reminders] ${sent} enviado(s), ${skipped} pulado(s)`)
  },
})

// ─── Tacit Approval Sweep ──────────────────────────────────────
// A cada 15 min varre approval_link procurando rows elegíveis pra
// aprovação tácita: silêncio em 30 dias DESDE O ENVIO via Meta Cloud
// (sentVia='meta_cloud' garante que a mensagem foi de fato entregue —
// wa.me manual não conta porque agency pode não ter clicado).
//
// Pra cada candidato, chama decideApprovalLink mode='tacit' que:
//   - Atomicamente seta decision='approved' tacit=true (idempotente)
//   - Flipa status do post no Notion pra approvedValue
//   - Postae audit comment "Aprovação automática · sem resposta em 30d"
//   - Advance chain de produção se kind='production_script'
//   - Notifica agency via email com subject "⏱ Aprovação automática"
export const tacitApprovalSweep = schedules.task({
  id: "tacit-approval-sweep",
  cron: { pattern: "*/15 * * * *", timezone: "America/Sao_Paulo" },
  run: async () => {
    const db = getDb()
    const threshold = new Date(Date.now() - APPROVAL_TTL_DAYS * 24 * 60 * 60 * 1000)

    const candidates = await db
      .select()
      .from(schema.approvalLink)
      .where(and(
        isNull(schema.approvalLink.decision),
        eq(schema.approvalLink.sentVia, "meta_cloud"),
        isNotNull(schema.approvalLink.sentAt),
        lt(schema.approvalLink.sentAt, threshold),
      ))

    if (candidates.length === 0) {
      logger.info("[tacit] nenhum link elegível, nada a fazer")
      return
    }

    logger.info(`[tacit] ${candidates.length} link(s) com 30+ dias sem resposta — aprovando tacitamente`)

    const { decideApprovalLink } = await import("../lib/approval-decide")

    let approved = 0
    let raced = 0
    let failed = 0
    for (const row of candidates) {
      try {
        const result = await decideApprovalLink({
          row,
          decision: "approved",
          mode: "tacit",
        })
        if (result.ok) {
          approved++
          logger.info(`[tacit] ✓ "${row.postTitle}" aprovado tacitamente`)
        } else if (result.reason === "already_decided") {
          raced++
          // Cliente decidiu entre o select e o update — não é erro.
        } else {
          failed++
          logger.warn(`[tacit] falha em ${row.id}: ${result.reason}`)
        }
      } catch (e) {
        failed++
        logger.error(`[tacit] erro inesperado em ${row.id}: ${e}`)
      }
    }

    logger.info(`[tacit] ${approved} aprovado(s), ${raced} race(s) com cliente, ${failed} falha(s)`)
  },
})
