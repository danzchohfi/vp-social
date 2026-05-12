import { signProxyUrl } from "./tiktok-proxy"
import { fetchWithRetry } from "./fetch-with-retry"

const TIKTOK_API = "https://open.tiktokapis.com/v2"
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetchWithRetry(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    logContext: { platform: "tiktok", op: "refresh_token" },
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
  const proxiedUrl = signProxyUrl(videoUrl)

  async function queryPrivacyLevels(token: string): Promise<string[]> {
    const res = await fetch(`${TIKTOK_API}/post/publish/creator_info/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
    })
    const data = await res.json()
    return data.data?.privacy_level_options ?? []
  }

  async function initUpload(token: string, privacyLevel: string) {
    const res = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption.slice(0, 2200),
          privacy_level: privacyLevel,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: { source: "PULL_FROM_URL", video_url: proxiedUrl },
      }),
    })
    return res.json()
  }

  let token = accessToken
  let privacyLevels = await queryPrivacyLevels(token)

  if (!privacyLevels.length) {
    token = await refreshAccessToken(refreshToken)
    privacyLevels = await queryPrivacyLevels(token)
  }

  const audited = process.env.TIKTOK_AUDITED === "true"
  const privacyLevel = audited
    ? (privacyLevels.find((p) => p === "PUBLIC_TO_EVERYONE") ?? privacyLevels[0] ?? "SELF_ONLY")
    : "SELF_ONLY"

  let result = await initUpload(token, privacyLevel)

  if (result.error?.code === "access_token_invalid") {
    token = await refreshAccessToken(refreshToken)
    result = await initUpload(token, privacyLevel)
  }

  if (result.error?.code !== "ok") {
    const code = result.error?.code ?? "unknown"
    const message = result.error?.message ?? "TikTok publish failed"
    const logId = result.error?.log_id ?? ""
    throw new Error(`TikTok [${code}] ${message} (privacy=${privacyLevel}, allowed=[${privacyLevels.join(",")}], log=${logId})`)
  }

  const publishId = result.data?.publish_id ?? result.data?.video_id
  if (!publishId) return "ok"

  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const statusRes = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
    })
    const statusData = await statusRes.json()
    const status = statusData.data?.status
    if (status === "PUBLISH_COMPLETE") return publishId
    if (status === "FAILED") {
      const reason = statusData.data?.fail_reason ?? "unknown"
      throw new Error(`TikTok publish FAILED: ${reason} (publish_id=${publishId})`)
    }
  }

  throw new Error(`TikTok publish timeout — still processing after 30s (publish_id=${publishId})`)
}
