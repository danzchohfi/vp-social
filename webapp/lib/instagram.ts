const GRAPH = "https://graph.facebook.com/v19.0"

export function createInstagramPublisher(accountId: string, accessToken: string) {
  return {
    async publishSingle(imageUrl: string, caption: string): Promise<string> {
      const containerId = await createImageContainer(accountId, accessToken, imageUrl, caption)
      await waitForContainer(accountId, accessToken, containerId)
      return publishContainer(accountId, accessToken, containerId)
    },

    async publishCarousel(imageUrls: string[], caption: string): Promise<string> {
      if (imageUrls.length < 2 || imageUrls.length > 10) {
        throw new Error("Carrossel requer entre 2 e 10 imagens")
      }
      const childIds: string[] = []
      for (const url of imageUrls) {
        const id = await createCarouselItem(accountId, accessToken, url)
        await waitForContainer(accountId, accessToken, id)
        childIds.push(id)
      }
      const carouselId = await createCarouselContainer(accountId, accessToken, childIds, caption)
      await waitForContainer(accountId, accessToken, carouselId)
      return publishContainer(accountId, accessToken, carouselId)
    },
  }
}

async function createImageContainer(accountId: string, token: string, imageUrl: string, caption: string): Promise<string> {
  return postGraph(`/${accountId}/media`, token, { image_url: imageUrl, caption })
}

async function createCarouselItem(accountId: string, token: string, imageUrl: string): Promise<string> {
  return postGraph(`/${accountId}/media`, token, { image_url: imageUrl, is_carousel_item: "true" })
}

async function createCarouselContainer(accountId: string, token: string, childIds: string[], caption: string): Promise<string> {
  return postGraph(`/${accountId}/media`, token, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
  })
}

async function publishContainer(accountId: string, token: string, containerId: string): Promise<string> {
  return postGraph(`/${accountId}/media_publish`, token, { creation_id: containerId })
}

async function waitForContainer(accountId: string, token: string, containerId: string, attempts = 10): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${GRAPH}/${containerId}?fields=status_code&access_token=${token}`)
    const data = await res.json()
    if (data.status_code === "FINISHED") return
    if (data.status_code === "ERROR") throw new Error(`Erro ao processar container ${containerId}`)
    await sleep(3000 * (i + 1))
  }
  throw new Error(`Container ${containerId} não ficou pronto a tempo`)
}

async function postGraph(path: string, token: string, body: Record<string, string>): Promise<string> {
  const params = new URLSearchParams({ ...body, access_token: token })
  const res = await fetch(`${GRAPH}${path}`, { method: "POST", body: params })
  const data = await res.json()
  if (!res.ok) throw new Error(`Instagram API: ${data.error?.message ?? res.statusText}`)
  return data.id
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
