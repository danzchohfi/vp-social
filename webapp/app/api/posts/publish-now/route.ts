import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection, fieldMapping, instagramAccount } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { publishToPlatform, saveLog, claimPublishSlot, completePublishSlot, isVideo } from "@/lib/publisher"
import { userHasClientAccess } from "@/lib/active-client"
import { probeMp4DurationSec } from "@/lib/mp4-duration"

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 })
  }
  const pageId = typeof body.pageId === "string" ? body.pageId : ""
  const connectionId = typeof body.connectionId === "string" ? body.connectionId : ""
  if (!pageId || !connectionId) {
    return NextResponse.json({ error: "pageId e connectionId obrigatórios" }, { status: 400 })
  }

  // Look up connection by id only — access is gated by client membership
  // below so that members of an agency-scope client can publish too.
  const [connection] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.id, connectionId))

  if (!connection) {
    return NextResponse.json({ error: "Conexão Notion não encontrada" }, { status: 404 })
  }

  // Either the user owns the connection (legacy / personal) OR has client
  // access (agency / member). Without this, members can't publish posts of
  // their own client.
  const accessOk = connection.userId === userId
    || (connection.clientId && await userHasClientAccess(userId, connection.clientId))
  if (!accessOk) {
    return NextResponse.json({ error: "Sem acesso a esta conexão" }, { status: 403 })
  }

  if (!connection.databaseId) {
    return NextResponse.json(
      { error: "Nenhum database do Notion selecionado nesta conexão. Vá em Configurações e escolha um database." },
      { status: 400 }
    )
  }

  const [mappingRow] = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, connectionId))

  const mapping = mappingRow ?? DEFAULT_MAPPING
  const notion = createNotionClient(connection.accessToken)

  const posts = await notion.getReadyPosts(connection.databaseId, mapping)
  const post = posts.find((p) => p.pageId === pageId)
  if (!post) {
    return NextResponse.json(
      { error: "Post não encontrado ou ainda não está pronto para publicação" },
      { status: 404 }
    )
  }

  // Account lookup is scoped to the connection's client (or to the
  // connection owner when clientId is null). Filtering by session.user.id
  // would silently drop accounts owned by another member of the same client.
  const accounts = await db
    .select()
    .from(instagramAccount)
    .where(
      connection.clientId
        ? eq(instagramAccount.clientId, connection.clientId)
        : eq(instagramAccount.userId, connection.userId)
    )

  const accountMap = new Map(
    accounts.filter((a) => a.active).map((a) => [`${a.platform.toLowerCase()}:${a.conta.toLowerCase()}`, a])
  )

  const results: Array<{ platform: string; status: "published" | "failed" | "skipped"; postId?: string; postUrl?: string | null; error?: string }> = []
  let anyPublished = false
  let anyFailed = false
  // True when the pre-check found at least one target that was already
  // published in a previous run. Used to flip Notion status to Publicado
  // (recovery case) instead of Erro when nothing new happened this run.
  let anyPreviouslyDone = false
  // Collect all published-platform URLs so we can write them to the Notion
  // link field as a single rich_text block. Multiple platforms otherwise
  // overwrite each other.
  const publishedLinks: Array<{ platform: string; url: string }> = []

  if (!post.publishTargets.length) {
    return NextResponse.json(
      { error: 'O campo "Publicar em" está vazio neste post' },
      { status: 400 }
    )
  }

  for (const target of post.publishTargets) {
    const key = `${target.platform}:${post.conta.toLowerCase()}`
    const account = accountMap.get(key)

    if (!account) {
      const msg = `Conta "${post.conta}" não configurada para ${target.platform}`
      await saveLog(db, userId, connectionId, post, null, null, target.raw, "skipped", msg, connection.clientId)
      results.push({ platform: target.raw, status: "skipped", error: msg })
      continue
    }

    // Pre-check: IG Story video > 60s would fail with the cryptic 2207082
    // from Meta's side. The auto-split pipeline (lib/video-splitter.ts) only
    // runs in the Trigger.dev worker (ffmpeg + Vercel Blob, can't fit in a
    // 50MB Vercel function). So here we use a pure-JS MP4 box parser to
    // probe duration; if > 60s, refuse with a clear message pointing the
    // user at scheduled publish (which the cron will split). When the
    // probe returns null (non-fast-start MP4 or non-MP4) we fall through
    // and let IG decide.
    const tipoLower = target.tipo.toLowerCase().trim()
    if (target.platform === "instagram" && tipoLower === "story") {
      const storyVideoUrl = post.verticalUrls[0]
      if (storyVideoUrl && isVideo(storyVideoUrl)) {
        const duration = await probeMp4DurationSec(storyVideoUrl)
        if (duration !== null && duration > 60) {
          const msg = `Story de ${Math.round(duration)}s não pode ser publicado via "Publicar agora" (IG aceita só até 60s). Mude o status para "Agendamento" no Notion com data próxima — o cron vai fatiar em chunks de 60s automaticamente.`
          await saveLog(db, userId, connectionId, post, null, null, target.raw, "failed", msg, connection.clientId)
          results.push({ platform: target.raw, status: "failed", error: msg })
          anyFailed = true
          continue
        }
      }
    }

    // Atomic claim — INSERT a 'pending' row before calling the external API.
    // The unique index on (connection, page, platform) WHERE status IN
    // ('published', 'pending') makes this a true mutex: if another worker
    // (cron tick OR concurrent /publish-now click) already has the slot,
    // we get a unique violation here and skip without ever calling IG/FB,
    // which is what prevents the duplicate-publish bug from 2026-05-08.
    const claim = await claimPublishSlot(db, userId, connectionId, post, target.raw, connection.clientId)
    if ("conflict" in claim) {
      anyPreviouslyDone = true
      results.push({
        platform: target.raw,
        status: "skipped",
        error: "Já publicado ou em publicação por outro worker — ignorado para evitar duplicata",
      })
      continue
    }

    try {
      const { id: postId, url: postUrl } = await publishToPlatform(target.platform, target.tipo, account, post)
      await completePublishSlot(db, claim.rowId, target.raw, "published", postId, postUrl, null)
      if (postUrl) publishedLinks.push({ platform: target.raw, url: postUrl })
      results.push({ platform: target.raw, status: "published", postId, postUrl })
      anyPublished = true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await completePublishSlot(db, claim.rowId, target.raw, "failed", null, null, message)
      results.push({ platform: target.raw, status: "failed", error: message })
      anyFailed = true
    }
  }

  // Status flip decision tree:
  //  - any new success this run → Publicado
  //  - any "already published" hit during pre-check → Publicado (recovery
  //    from a previous run whose status flip failed)
  //  - else (only failures or skipped-for-other-reasons) → Erro
  // Same split as trigger/publish.ts (b18a1ea): flip MUST run before link
  // writeback so that setPostUrls failures can't strand the post.
  try {
    if (anyPublished || anyPreviouslyDone) await notion.markPublished(post.pageId, mapping)
    else if (anyFailed || results.length) await notion.markFailed(post.pageId, mapping)
  } catch (e) {
    console.error(`[publish-now] CRITICAL: failed to flip Notion status for "${post.title}":`, e)
  }

  if (publishedLinks.length > 0) {
    try {
      await notion.setPostUrls(post.pageId, mapping, publishedLinks)
    } catch (e) {
      console.warn(`[publish-now] failed to write links for "${post.title}":`, e)
    }
  }

  return NextResponse.json({ results, post: { title: post.title, conta: post.conta } })
}
