import { schedules, task, logger } from "@trigger.dev/sdk"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { and, eq, inArray, isNull, lt } from "drizzle-orm"
import * as schema from "../lib/db/schema"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping, type NotionPost } from "../lib/notion"
import { publishToPlatform, saveLog, claimPublishSlot, completePublishSlot, hasPriorPublish, isVideo } from "../lib/publisher"
import { createInstagramPublisher, fetchInstagramPermalink } from "../lib/instagram"
import { probeVideoDurationSec, splitStoryVideo } from "../lib/video-splitter"
import { notifyPublishFailureAsync } from "../lib/email-notifications"
import { sendApprovalRequest, validatePhoneE164 } from "../lib/manychat"
import { generateId } from "../lib/utils"
import { findApproverByPhone } from "../lib/approvers"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://posts.vitaminapublicitaria.com.br"
const APPROVAL_TTL_DAYS = 14
const STORY_CHUNK_PAUSE_MS = 30_000

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function getDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle(sql, { schema })
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

    // Owning client name + ManyChat config — fetched once per connection so
    // we don't N+1 inside the per-post loop.
    let clientName: string | null = null
    let manychatApiKey: string | null = null
    let manychatFlowNs: string | null = null
    let approvalMode: "auto_manychat" | "manual_whatsapp" = "auto_manychat"
    // 'auto' = cron dispatches WhatsApp on every new pending post.
    // 'manual' = cron creates the approvalLink but doesn't dispatch; agency
    // clicks "Notificar pendentes" on /dashboard to fire a digest.
    let approvalDispatchMode: "auto" | "manual" = "auto"
    if (connection.clientId) {
      const [c] = await db
        .select({
          name: schema.client.name,
          manychatApiKey: schema.client.manychatApiKey,
          manychatApprovalFlowNs: schema.client.manychatApprovalFlowNs,
          approvalNotificationMode: schema.client.approvalNotificationMode,
          approvalDispatchMode: schema.client.approvalDispatchMode,
          publishingPaused: schema.client.publishingPaused,
        })
        .from(schema.client)
        .where(eq(schema.client.id, connection.clientId))
      // Hard pause: skip publish + approval sweep entirely. We exit here
      // (not before the connection lookup) so the log line includes the
      // client name for clarity, and so the cron schedule itself isn't
      // affected — only the per-connection work.
      if (c?.publishingPaused) {
        logger.info(`[paused] cliente "${c.name}" — publicações pausadas, pulando este tick.`)
        return { published: 0, failed: 0, skipped: 0 }
      }
      clientName = c?.name ?? null
      manychatApiKey = c?.manychatApiKey ?? null
      manychatFlowNs = c?.manychatApprovalFlowNs ?? null
      // Treat NULL as auto_manychat for backward compat with clients
      // configured before the column existed.
      if (c?.approvalNotificationMode === "manual_whatsapp") {
        approvalMode = "manual_whatsapp"
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
          manychatApiKey,
          manychatFlowNs,
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
  // Notification mode for this client. 'manual_whatsapp' = skip ManyChat
  // dispatch entirely — agency uses the click-to-chat WA button on
  // /scheduled. 'auto_manychat' = try ManyChat, fall back to sentVia='none'
  // if creds missing or API rejects.
  approvalMode: "auto_manychat" | "manual_whatsapp"
  // When 'manual', cron creates the approvalLink but does NOT dispatch.
  // Agency triggers via /api/clients/[id]/notify-pending later.
  approvalDispatchMode: "auto" | "manual"
  manychatApiKey: string | null
  manychatFlowNs: string | null
}

async function runApprovalSweep(a: SweepArgs): Promise<void> {
  const { db, notion, connectionId, clientId, clientName, userId, mapping, approvalMode, approvalDispatchMode, manychatApiKey, manychatFlowNs } = a
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
  // actually sent (sentVia='manychat'|'manual') keeps its WhatsApp URL
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
    const byName = allClients.find((c) => c.name.trim().toLowerCase() === conta)
    if (byName) return byName.id
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

  // First pass: release the partial unique index slot for any expired+pending
  // links. Without this, a post that aged past the 14-day TTL without a
  // decision would block all future approval cycles (the unique index keeps
  // one pending row per pageId; the row is pending+expired so neither the
  // client nor the cron can move it forward). Set decision='expired' — a
  // synthetic value lookupApprovalLink + the bucketing endpoints recognize
  // and surface as "expired" in the UI rather than as a real decision.
  const now = new Date()
  const expiredRelease = await db
    .update(schema.approvalLink)
    .set({ decision: "expired", decidedAt: now })
    .where(and(
      // Scope by connectionId — see comment above resolveOwnerClient
      // re: per-conta routing. clientId varies across links from one
      // sweep now.
      eq(schema.approvalLink.connectionId, connectionId),
      isNull(schema.approvalLink.decision),
      lt(schema.approvalLink.expiresAt, now),
    ))
    .returning({ id: schema.approvalLink.id, postTitle: schema.approvalLink.postTitle })
  if (expiredRelease.length > 0) {
    logger.warn(`Liberou ${expiredRelease.length} link(s) de aprovação expirado(s) — vai recriar no mesmo ciclo.`)
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
    //   manual_whatsapp → skip ManyChat entirely. Mark sentVia='manual'
    //                     so the UI knows this is an intended state, not
    //                     a misconfiguration. Agency sees the row in
    //                     /scheduled with a "Enviar via WA" wa.me button.
    //   auto_manychat   → try ManyChat. On failure or missing creds, fall
    //                     back to sentVia='none' and the agency manually
    //                     nudges via the same click-to-chat button.
    // 'invalid_phone' = ManyChat dispatch was skipped because the
    // contact's phone in the Notion DB doesn't look like a real E.164
    // number. UI surfaces this clearly in /scheduled so the agency
    // knows to fix the Contato page (vs. silent ManyChat 'not found').
    let sentVia: "manychat" | "manual" | "invalid_phone" | "none" = "none"
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
    } else if (approvalMode === "manual_whatsapp") {
      sentVia = "manual"
      logger.info(`[approval] modo manual: link gerado para "${post.title}" — agência envia via wa.me em /scheduled`)
    } else if (phoneIssue) {
      sentVia = "invalid_phone"
      lastError = `Telefone inválido (${contact.phone}): ${phoneIssue}`
      logger.warn(`[approval] telefone inválido pra "${post.title}" (${contact.phone}): ${phoneIssue}. Agência precisa corrigir a página Contato no Notion.`)
    } else if (contact.phone && manychatApiKey && manychatFlowNs) {
      const result = await sendApprovalRequest({
        apiKey: manychatApiKey,
        flowNs: manychatFlowNs,
        phone: contact.phone,
        customFields: {
          approval_url: approvalUrl,
          post_title: post.title || "",
          // post_url and other custom fields the WA template may want.
          // The agency creates the matching custom fields in ManyChat —
          // undefined field names get surfaced as setCustomFields errors
          // (see lib/manychat.ts). For the recipient's name, prefer the
          // native `{{Primeiro Nome}}` (first_name) in the template — no
          // custom field needed.
          post_url: post.notionUrl || "",
        },
      })
      if (result.ok) {
        sentVia = "manychat"
        lastError = null
        logger.info(`[approval] ManyChat enviado para ${contact.phone} (${post.title})`)
      } else {
        lastError = `ManyChat: ${result.reason}`
        logger.warn(`[approval] ManyChat falhou para "${post.title}": ${result.reason}`)
      }
    } else if (!manychatApiKey || !manychatFlowNs) {
      lastError = "ManyChat não configurado pra este cliente (API key + Flow em /settings)"
      logger.warn(`[approval] ManyChat não configurado para este cliente — agência precisa enviar manualmente via /scheduled (ou trocar pra modo manual em /clients)`)
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
      sentVia === "manychat" ? `via WhatsApp pra ${recipient}`
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

// ─── Production-approval stale-link reminders ───────────────────
// Daily 9am São Paulo: nudges any production-script approval link
// that's been sitting pending for >3 days without a decision. Sends
// the same ManyChat flow as the original dispatch but tags the row
// with reminderSentAt so each link only gets ONE reminder (no spam
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
    for (const row of live) {
      // Re-resolve approver name + client ManyChat config every loop —
      // safer than a batch join when row counts are small (typical: 1–10
      // a day). Skip if approver is missing (deleted) or no phone.
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
        const [client] = await db
          .select({
            manychatApiKey: schema.client.manychatApiKey,
            manychatFlowNs: schema.client.manychatApprovalFlowNs,
          })
          .from(schema.client)
          .where(eq(schema.client.id, row.clientId))
        if (!client?.manychatApiKey || !client?.manychatFlowNs) {
          skipped++
          continue
        }

        const dispatch = await sendApprovalRequest({
          apiKey: client.manychatApiKey,
          flowNs: client.manychatFlowNs,
          phone: approver.phone,
          customFields: {
            approval_url: `${APP_URL}/approve/${row.token}`,
            post_title: row.postTitle,
            post_url: "",
            // Custom flag the user's ManyChat flow CAN read to switch the
            // template (e.g. "Lembrete: você ainda tem ..."). If the
            // custom field doesn't exist in their ManyChat account the
            // dispatch still goes through — ManyChat ignores unknown
            // fields by default. For the recipient's name, prefer the
            // native `{{Primeiro Nome}}` (first_name) in the template.
            is_reminder: "true",
          },
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
          logger.warn(`[reminders] ManyChat falhou pra "${row.postTitle}": ${dispatch.reason}`)
        }
      } catch (e) {
        skipped++
        logger.error(`[reminders] erro inesperado processando ${row.id}: ${e}`)
      }
    }

    logger.info(`[reminders] ${sent} enviado(s), ${skipped} pulado(s)`)
  },
})
