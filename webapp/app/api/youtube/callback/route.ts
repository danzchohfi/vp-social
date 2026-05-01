import { db } from "@/lib/db"
import { instagramAccount } from "@/lib/db/schema"
import { generateId } from "@/lib/utils"
import { getActiveClientId } from "@/lib/active-client"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const rawState = searchParams.get("state") ?? ""
  const [userId, from] = rawState.split(":")
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const successUrl = from ? `${appUrl}/${from}?youtube_connected=true` : `${appUrl}/accounts?connected=youtube`
  const errorBase = from ? `${appUrl}/${from}` : `${appUrl}/accounts`

  if (!code || !userId) return NextResponse.redirect(`${errorBase}?error=cancelled`)

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${appUrl}/api/youtube/callback`,
        grant_type: "authorization_code",
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error(tokenData.error_description ?? "Token inválido")

    // Fetch channel info
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    )
    const channelData = await channelRes.json()
    const channel = channelData.items?.[0]
    if (!channel) throw new Error("Nenhum canal YouTube encontrado")

    const channelId = channel.id as string
    const channelTitle = channel.snippet.title as string

    const clientId = await getActiveClientId(userId)

    await db
      .insert(instagramAccount)
      .values({
        id: generateId(),
        userId,
        clientId,
        platform: "youtube",
        conta: channelTitle,
        pageName: channelTitle,
        pageId: channelId,
        platformAccountId: channelId,
        pageAccessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        active: true,
      })
      .onConflictDoUpdate({
        target: [instagramAccount.userId, instagramAccount.platform, instagramAccount.pageId],
        set: {
          clientId,
          pageAccessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token ?? null,
          pageName: channelTitle,
          updatedAt: new Date(),
        },
      })

    return NextResponse.redirect(successUrl)
  } catch (e) {
    console.error("YouTube callback error:", e)
    return NextResponse.redirect(`${errorBase}?error=failed`)
  }
}
