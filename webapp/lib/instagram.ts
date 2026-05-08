/**
 * Instagram Graph API publisher
 *
 * Limites importantes:
 * ─ Feed imagem:   JPG/PNG, máx 8MB, proporção 1.91:1 até 4:5, mín 320px
 * ─ Carrossel:     2–10 itens (todos imagens OU todos vídeos)
 * ─ Reel:          MP4 H.264, máx 1GB, 3–90s, proporção 9:16 recomendada
 * ─ Story imagem:  JPG/PNG, proporção 9:16, máx 30MB
 * ─ Story vídeo:   MP4, máx 100MB, 3–60s, proporção 9:16
 * ─ Feed vídeo:    MP4 H.264, máx 1GB, 3–60min, proporção 4:5 a 16:9
 * ─ Publicações:   máx 25 posts por 24h por conta
 */

const GRAPH = "https://graph.facebook.com/v19.0"

export function createInstagramPublisher(accountId: string, accessToken: string) {
  return {
    /** Imagem única no feed */
    async publishFeedImage(imageUrl: string, caption: string): Promise<string> {
      const id = await createContainer(accountId, accessToken, {
        image_url: imageUrl,
        caption,
      })
      await waitForContainer(accountId, accessToken, id)
      return publishContainer(accountId, accessToken, id)
    },

    /** Carrossel de imagens no feed (2–10 imagens) */
    async publishCarousel(imageUrls: string[], caption: string): Promise<string> {
      if (imageUrls.length < 2 || imageUrls.length > 10) {
        throw new Error("Carrossel requer entre 2 e 10 imagens")
      }
      const childIds: string[] = []
      for (const url of imageUrls) {
        const id = await createContainer(accountId, accessToken, {
          image_url: url,
          is_carousel_item: "true",
        })
        await waitForContainer(accountId, accessToken, id)
        childIds.push(id)
      }
      const carouselId = await createContainer(accountId, accessToken, {
        media_type: "CAROUSEL",
        children: childIds.join(","),
        caption,
      })
      await waitForContainer(accountId, accessToken, carouselId)
      return publishContainer(accountId, accessToken, carouselId)
    },

    /** Reel (vídeo vertical, aparece no feed e aba Reels) */
    async publishReel(
      videoUrl: string,
      caption: string,
      thumbnailUrl?: string | null,
      shareToFeed = true
    ): Promise<string> {
      const id = await createContainer(accountId, accessToken, {
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        share_to_feed: shareToFeed ? "true" : "false",
        ...(thumbnailUrl ? { thumb_offset: "0" } : {}),
      })
      await waitForContainer(accountId, accessToken, id, 20)
      return publishContainer(accountId, accessToken, id)
    },

    /** Story de imagem (some após 24h) */
    async publishStoryImage(imageUrl: string): Promise<string> {
      const id = await createContainer(accountId, accessToken, {
        media_type: "STORIES",
        image_url: imageUrl,
      })
      await waitForContainer(accountId, accessToken, id)
      return publishContainer(accountId, accessToken, id)
    },

    /** Story de vídeo (some após 24h) */
    async publishStoryVideo(videoUrl: string): Promise<string> {
      const id = await createContainer(accountId, accessToken, {
        media_type: "STORIES",
        video_url: videoUrl,
      })
      await waitForContainer(accountId, accessToken, id, 20)
      return publishContainer(accountId, accessToken, id)
    },

    /** Vídeo no feed */
    async publishFeedVideo(videoUrl: string, caption: string, thumbnailUrl?: string | null): Promise<string> {
      const id = await createContainer(accountId, accessToken, {
        media_type: "VIDEO",
        video_url: videoUrl,
        caption,
        ...(thumbnailUrl ? { thumb_offset: "0" } : {}),
      })
      await waitForContainer(accountId, accessToken, id, 20)
      return publishContainer(accountId, accessToken, id)
    },
  }
}

// ─── Helpers ────────────────────────────────────

async function createContainer(
  accountId: string,
  token: string,
  params: Record<string, string>
): Promise<string> {
  return postGraph(`/${accountId}/media`, token, params)
}

async function publishContainer(accountId: string, token: string, containerId: string): Promise<string> {
  return postGraph(`/${accountId}/media_publish`, token, { creation_id: containerId })
}

async function waitForContainer(
  accountId: string,
  token: string,
  containerId: string,
  maxAttempts = 10
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${GRAPH}/${containerId}?fields=status_code,status&access_token=${token}`
    )
    const data = await res.json()
    const code = data.status_code as string

    if (code === "FINISHED") return
    if (code === "ERROR" || code === "EXPIRED") {
      const status = (data.status as string) ?? code
      const hint = describeIgError(status)
      throw new Error(`Erro no container ${containerId}: ${status}${hint ? ` — ${hint}` : ""}`)
    }

    // IN_PROGRESS ou PUBLISHED → aguarda
    await sleep(4000 * (i + 1))
  }
  throw new Error(`Container ${containerId} não ficou pronto a tempo`)
}

// Map known Meta media-upload error codes to actionable hints (pt-BR).
// Codes documented at developers.facebook.com/docs/instagram-platform/troubleshooting.
function describeIgError(status: string): string | null {
  if (status.includes("2207082")) {
    return "Mídia em formato/proporção não suportada. Story exige MP4 H.264 9:16 3–60s ≤100MB (vídeo) ou JPG/PNG 9:16 ≤30MB (imagem). Reel exige MP4 H.264 9:16 3–90s ≤1GB. Para vídeo de Story >60s, agende (não use Publicar agora) — o cron vai fatiar em chunks de 60s automaticamente."
  }
  if (status.includes("2207003")) {
    return "URL da mídia inacessível ou expirou antes do download. Confirme que a URL é pública e estável (sem auth, sem redirect quebrando)."
  }
  if (status.includes("2207004")) {
    return "Codec de vídeo não suportado. Re-encode como MP4 H.264 + áudio AAC (ex: ffmpeg -i in.mov -c:v libx264 -c:a aac out.mp4)."
  }
  if (status.includes("2207026")) {
    return "Vídeo excede duração máxima. Story 60s, Reel 90s, Feed 60min."
  }
  if (status.includes("2207020")) {
    return "Resolução de vídeo abaixo do mínimo. IG exige 540×960 (9:16) ou superior."
  }
  return null
}

async function postGraph(
  path: string,
  token: string,
  body: Record<string, string>
): Promise<string> {
  const params = new URLSearchParams({ ...body, access_token: token })
  const res = await fetch(`${GRAPH}${path}`, { method: "POST", body: params })
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(`Instagram API (${path}): ${data.error?.message ?? res.statusText}`)
  }
  return data.id
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Fetch the public permalink for a published IG media. */
export async function fetchInstagramPermalink(mediaId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH}/${mediaId}?fields=permalink&access_token=${token}`)
    const data = await res.json()
    return typeof data.permalink === "string" ? data.permalink : null
  } catch {
    return null
  }
}

// ─── Analytics ───────────────────────────────────

export interface PostMetrics {
  likes: number | null
  comments: number | null
  reach: number | null
  saves: number | null
  impressions: number | null
}

export async function getPostMetrics(mediaId: string, accessToken: string): Promise<PostMetrics> {
  // Fetch like_count and comments_count from the media object
  const mediaRes = await fetch(
    `${GRAPH}/${mediaId}?fields=like_count,comments_count,media_type&access_token=${accessToken}`
  )
  const media = await mediaRes.json()
  if (media.error) throw new Error(`Instagram metrics (media): ${media.error.message}`)

  // Fetch reach, saved, impressions from insights
  // Reels use "plays" instead of "impressions"
  const isReel = media.media_type === "REELS"
  const insightMetrics = isReel
    ? "reach,saved,plays,likes,comments"
    : "reach,saved,impressions"

  const insightRes = await fetch(
    `${GRAPH}/${mediaId}/insights?metric=${insightMetrics}&access_token=${accessToken}`
  )
  const insight = await insightRes.json()

  const get = (name: string): number | null => {
    const entry = insight.data?.find((m: any) => m.name === name)
    return entry?.values?.[0]?.value ?? entry?.value ?? null
  }

  return {
    likes: media.like_count ?? get("likes") ?? null,
    comments: media.comments_count ?? get("comments") ?? null,
    reach: get("reach"),
    saves: get("saved"),
    impressions: get("impressions") ?? get("plays") ?? null,
  }
}
