const TOKEN_URL = "https://oauth2.googleapis.com/token"
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3"
const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3/videos"

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(data.error_description ?? "YouTube token refresh failed")
  return data.access_token
}

export async function uploadYouTubeVideo(
  accessToken: string,
  refreshToken: string,
  videoUrl: string,
  title: string,
  description: string,
  isShort = false
): Promise<string> {
  // Fetch the video content from the URL
  const videoRes = await fetch(videoUrl)
  if (!videoRes.ok) throw new Error(`Failed to fetch video from URL: ${videoRes.status}`)
  const videoBuffer = await videoRes.arrayBuffer()
  const contentType = videoRes.headers.get("content-type") ?? "video/mp4"

  const finalDescription = isShort ? `${description}\n\n#shorts` : description

  const metadata = {
    snippet: { title, description: finalDescription, categoryId: "22" },
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
  }

  async function doUpload(token: string): Promise<Response> {
    const boundary = "vpsocial_boundary"
    const metaPart = JSON.stringify(metadata)
    const bodyParts = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`,
      `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    ]
    const encoder = new TextEncoder()
    const part1 = encoder.encode(bodyParts[0])
    const part2 = encoder.encode(bodyParts[1])
    const end = encoder.encode(`\r\n--${boundary}--`)
    const body = new Uint8Array(part1.length + part2.length + videoBuffer.byteLength + end.length)
    body.set(part1, 0)
    body.set(part2, part1.length)
    body.set(new Uint8Array(videoBuffer), part1.length + part2.length)
    body.set(end, part1.length + part2.length + videoBuffer.byteLength)

    return fetch(`${UPLOAD_API}?uploadType=multipart&part=snippet,status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    })
  }

  let res = await doUpload(accessToken)

  // Token expired — refresh and retry once
  if (res.status === 401) {
    const newToken = await refreshAccessToken(refreshToken)
    res = await doUpload(newToken)
  }

  const data = await res.json()
  if (!res.ok || !data.id) throw new Error(data.error?.message ?? `YouTube upload failed: ${res.status}`)
  return data.id
}
