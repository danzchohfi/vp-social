import { schedules, task, logger } from "@trigger.dev/sdk"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { and, eq, isNull, lt } from "drizzle-orm"
import * as schema from "../lib/db/schema"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping, type NotionPost } from "../lib/notion"
import { publishToPlatform, saveLog, isVideo } from "../lib/publisher"
import { createInstagramPublisher, fetchInstagramPermalink } from "../lib/instagram"
import { probeVideoDurationSec, splitStoryVideo } from "../lib/video-splitter"
import { notifyPublishFailureAsync } from "../lib/email-notifications"
import { sendApprovalRequest } from "../lib/manychat"
import { generateId } from "../lib/utils"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://posts.vitaminapublicitaria.com.br"
const APPROVAL_TTL_DAYS = 14
const STORY_CHUNK_PAUSE_MS = 30_000

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Idempotency check that also recognizes chunked Story rows. When a
// long Story video is split into chunks we log them as "Instagram Story
// 1/3", "Instagram Story 2/3", ... — so a retry after a successful split
// publish would otherwise miss the prefix and re-publish from scratch.
function isAlreadyPublishedFor(targetRaw: string, alreadyDone: Set<string>): boolean {
  if (alreadyDone.has(targetRaw)) return true
  for (const platform of alreadyDone) {
    if (platform.startsWith(targetRaw + " ") && /\d+\/\d+$/.test(platform)) return true
  }
  return false
}

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
    if (connection.clientId) {
      const [c] = await db
        .select({
          name: schema.client.name,
          manychatApiKey: schema.client.manychatApiKey,
          manychatApprovalFlowNs: schema.client.manychatApprovalFlowNs,
        })
        .from(schema.client)
        .where(eq(schema.client.id, connection.clientId))
      clientName = c?.name ?? null
      manychatApiKey = c?.manychatApiKey ?? null
      manychatFlowNs = c?.manychatApprovalFlowNs ?? null
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
          mapping,
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

    // notion client is reused from the approval sweep above (same connection).

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

      // Idempotency pre-check: skip targets that already have a successful
      // publish_log row for this (connection, page). Defends against the
      // cron + manual /publish-now racing on the same post (e.g. user
      // clicked publish during the 30s window before the status flip).
      const previouslyPublished = await db
        .select({ platform: schema.publishLog.platform })
        .from(schema.publishLog)
        .where(and(
          eq(schema.publishLog.connectionId, connectionId),
          eq(schema.publishLog.notionPageId, post.pageId),
          eq(schema.publishLog.status, "published"),
        ))
      const alreadyDone = new Set(
        previouslyPublished.map((r) => r.platform).filter((p): p is string => !!p)
      )

      for (const target of post.publishTargets) {
        if (isAlreadyPublishedFor(target.raw, alreadyDone)) {
          logger.warn(`[${target.raw}] "${post.title}" já publicado — pulando para evitar duplicata.`)
          anyPreviouslyDone = true
          results.skipped++
          continue
        }

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
        // sequentially with a 30s pause. Each chunk is logged as a separate
        // publish_log row ("Instagram Story 1/3"). Idempotency on retry is
        // handled via isAlreadyPublishedFor's prefix match.
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
            try {
              const chunks = await splitStoryVideo(storyVideoUrl)
              const igPub = createInstagramPublisher(account.instagramBusinessAccountId, account.pageAccessToken)
              for (let i = 0; i < chunks.length; i++) {
                if (i > 0) await sleep(STORY_CHUNK_PAUSE_MS)
                const c = chunks[i]
                const chunkRaw = `${target.raw} ${c.index}/${c.total}`
                try {
                  const igId = await igPub.publishStoryVideo(c.url)
                  const igPermalink = await fetchInstagramPermalink(igId, account.pageAccessToken)
                  await saveLog(db, userId, connectionId, post, igId, igPermalink, chunkRaw, "published", null, connection.clientId)
                  if (igPermalink) publishedLinks.push({ platform: chunkRaw, url: igPermalink })
                  logger.info(`[${chunkRaw}/${post.conta}] ✓ chunk publicado: ${igId}`)
                  results.published++
                  anyPublished = true
                } catch (chunkErr) {
                  const message = chunkErr instanceof Error ? chunkErr.message : String(chunkErr)
                  logger.error(`[${chunkRaw}/${post.conta}] ✗ ${message}`)
                  await saveLog(db, userId, connectionId, post, null, null, chunkRaw, "failed", message, connection.clientId)
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
            }
          }
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
  mapping: FieldMapping
  manychatApiKey: string | null
  manychatFlowNs: string | null
}

async function runApprovalSweep(a: SweepArgs): Promise<void> {
  const { db, notion, connectionId, clientId, clientName, mapping, manychatApiKey, manychatFlowNs } = a
  if (!mapping.awaitingApprovalValue) return
  const connection = await db
    .select()
    .from(schema.notionConnection)
    .where(eq(schema.notionConnection.id, connectionId))
    .then((r) => r[0])
  if (!connection?.databaseId) return

  const posts = await notion.getPostsByStatus(connection.databaseId, mapping, mapping.awaitingApprovalValue)
  if (!posts.length) {
    logger.info(`Nenhum post aguardando aprovação no workspace ${connection.workspaceName}.`)
    return
  }

  logger.info(`${posts.length} post(s) aguardando aprovação no workspace ${connection.workspaceName}.`)

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
      eq(schema.approvalLink.clientId, clientId),
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
    const linkRow = {
      id: generateId(),
      token,
      clientId,
      connectionId,
      notionPageId: post.pageId,
      postTitle: post.title || "Sem título",
      contactName: contact.name,
      contactEmail: contact.email,
      contactPhone: contact.phone,
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

    // Notify via ManyChat (WhatsApp). Email path was removed by design —
    // agency wants WA-only because the whole client conversation already
    // lives in WA (ManyChat onboarding). If ManyChat fails, sentVia stays
    // "none" and the agency uses the click-to-chat WA button in /scheduled.
    let sentVia: "manychat" | "none" = "none"

    if (contact.phone && manychatApiKey && manychatFlowNs) {
      const result = await sendApprovalRequest({
        apiKey: manychatApiKey,
        flowNs: manychatFlowNs,
        phone: contact.phone,
        customFields: {
          approval_url: approvalUrl,
          post_title: post.title || "",
          // Optional fields the WA template may want. Agency creates the
          // matching custom fields in ManyChat — undefined names get
          // surfaced as setCustomFields errors (see lib/manychat.ts).
          contact_name: contact.name || "",
          post_url: post.notionUrl || "",
        },
      })
      if (result.ok) {
        sentVia = "manychat"
        logger.info(`[approval] ManyChat enviado para ${contact.phone} (${post.title})`)
      } else {
        logger.warn(`[approval] ManyChat falhou para "${post.title}": ${result.reason}`)
      }
    } else if (!manychatApiKey || !manychatFlowNs) {
      logger.warn(`[approval] ManyChat não configurado para este cliente — agência precisa enviar manualmente via /scheduled`)
    } else if (!contact.phone) {
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
      .set({ sentVia, sentAt: sentVia === "none" ? null : new Date() })
      .where(eq(schema.approvalLink.token, token))
  }
}
