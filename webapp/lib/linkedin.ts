const LI_API = "https://api.linkedin.com/v2"
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(data.error_description ?? "LinkedIn token refresh failed")
  return data.access_token
}

async function registerImageUpload(token: string, ownerUrn: string): Promise<{ uploadUrl: string; asset: string }> {
  const res = await fetch(`${LI_API}/assets?action=registerUpload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: ownerUrn,
        serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
      },
    }),
  })
  const data = await res.json()
  return {
    uploadUrl: data.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl,
    asset: data.value?.asset,
  }
}

export async function publishLinkedInPost(
  personUrn: string,
  accessToken: string,
  refreshToken: string,
  text: string,
  imageUrl?: string
): Promise<string> {
  async function doPublish(token: string): Promise<Response> {
    let media: object[] | undefined

    if (imageUrl) {
      const { uploadUrl, asset } = await registerImageUpload(token, personUrn)
      const imgRes = await fetch(imageUrl)
      const imgBuf = await imgRes.arrayBuffer()
      await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: imgBuf,
      })
      media = [{ status: "READY", description: { text: "" }, media: asset, title: { text: "" } }]
    }

    const shareContent: Record<string, unknown> = {
      shareCommentary: { text },
      shareMediaCategory: media ? "IMAGE" : "NONE",
    }
    if (media) shareContent.media = media

    return fetch(`${LI_API}/ugcPosts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        author: personUrn,
        lifecycleState: "PUBLISHED",
        specificContent: { "com.linkedin.ugc.ShareContent": shareContent },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    })
  }

  let res = await doPublish(accessToken)

  if (res.status === 401) {
    const newToken = await refreshAccessToken(refreshToken)
    res = await doPublish(newToken)
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? `LinkedIn publish failed: ${res.status}`)
  return res.headers.get("x-restli-id") ?? data.id ?? "ok"
}
