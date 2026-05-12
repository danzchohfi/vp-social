import { fetchWithRetry } from "./fetch-with-retry"

const GRAPH = "https://graph.facebook.com/v19.0"

export function createFacebookPublisher(pageId: string, pageAccessToken: string) {
  async function post(path: string, body: Record<string, unknown>) {
    const res = await fetchWithRetry(`${GRAPH}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, access_token: pageAccessToken }),
      logContext: { platform: "facebook", op: "publish", pageId, path },
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error?.message ?? `Facebook API error: ${res.status}`)
    return data
  }

  async function publishPhoto(imageUrl: string, caption: string, published = true): Promise<string> {
    const data = await post(`${pageId}/photos`, { url: imageUrl, caption, published })
    return data.post_id ?? data.id
  }

  async function publishFeedPost(message: string): Promise<string> {
    const data = await post(`${pageId}/feed`, { message })
    return data.id
  }

  async function publishSingleImage(imageUrl: string, caption: string): Promise<string> {
    return publishPhoto(imageUrl, caption)
  }

  async function publishCarousel(imageUrls: string[], caption: string): Promise<string> {
    // Upload each photo as unpublished, collect IDs, then publish as multi-photo post
    const photoIds = await Promise.all(
      imageUrls.map((url) =>
        post(`${pageId}/photos`, { url, published: false }).then((d) => d.id as string)
      )
    )
    const attached = photoIds.map((id) => ({ media_fbid: id }))
    const data = await post(`${pageId}/feed`, { message: caption, attached_media: attached })
    return data.id
  }

  async function publishVideo(videoUrl: string, description: string, title: string): Promise<string> {
    const data = await post(`${pageId}/videos`, { file_url: videoUrl, description, title })
    return data.id
  }

  return { publishSingleImage, publishCarousel, publishVideo, publishFeedPost }
}
