import { db } from "@/lib/db"
import { instagramAccount } from "@/lib/db/schema"
import { generateId } from "@/lib/utils"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const rawState = searchParams.get("state") ?? ""
  const [userId, from] = rawState.split(":")
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const successUrl = from ? `${appUrl}/${from}?tiktok_connected=true` : `${appUrl}/accounts?connected=tiktok`
  const errorBase = from ? `${appUrl}/${from}` : `${appUrl}/accounts`

  if (!code || !userId) return NextResponse.redirect(`${errorBase}?error=cancelled`)

  try {
    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${appUrl}/api/tiktok/callback`,
      }),
    })
    const tokenData = await tokenRes.json()
    const token = tokenData.data ?? tokenData
    if (!token.access_token) throw new Error(tokenData.message ?? "Token inválido")

    const userRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url",
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    )
    const userData = await userRes.json()
    const displayName = userData.data?.user?.display_name ?? "TikTok Account"
    const openId = token.open_id as string

    await db
      .insert(instagramAccount)
      .values({
        id: generateId(),
        userId,
        platform: "tiktok",
        conta: displayName,
        pageName: displayName,
        pageId: openId,
        platformAccountId: openId,
        pageAccessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        active: true,
      })
      .onConflictDoUpdate({
        target: [instagramAccount.userId, instagramAccount.platform, instagramAccount.pageId],
        set: {
          pageAccessToken: token.access_token,
          refreshToken: token.refresh_token ?? null,
          pageName: displayName,
          updatedAt: new Date(),
        },
      })

    return NextResponse.redirect(successUrl)
  } catch (e) {
    console.error("TikTok callback error:", e)
    return NextResponse.redirect(`${errorBase}?error=failed`)
  }
}
