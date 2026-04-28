const TIKTOK_API = "https://open.tiktokapis.com/v2"
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })
  const data = await res.json()
  if (!data.data?.access_token) throw new Error(data.message ?? "TikTok token refresh failed")
  return data.data.access_token
}

export async function publishTikTokVideo(
  openId: string,
  accessToken: string,
  refreshToken: string,
  videoUrl: string,
  caption: string
): Promise<string> {
  async function initUpload(token: string) {
    const res = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption.slice(0, 2200),
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
      }),
    })
    return res.json()
  }

  let result = await initUpload(accessToken)

  if (result.error?.code === "access_token_invalid") {
    const newToken = await refreshAccessToken(refreshToken)
    result = await initUpload(newToken)
  }

  if (result.error?.code !== "ok") {
    throw new Error(result.error?.message ?? "TikTok publish failed")
  }

  return result.data?.publish_id ?? result.data?.video_id ?? "ok"
}
