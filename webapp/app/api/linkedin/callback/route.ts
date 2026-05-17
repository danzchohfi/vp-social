import { db } from "@/lib/db"
import { instagramAccount } from "@/lib/db/schema"
import { generateId } from "@/lib/utils"
import { getActiveClientId } from "@/lib/active-client"
import { NextResponse } from "next/server"
import { consumeOAuthState } from "@/lib/oauth-state"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state") ?? ""
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const verified = await consumeOAuthState(state)
  const from = verified?.from ?? ""
  const userId = verified?.userId ?? ""

  const successUrl = from ? `${appUrl}/${from}?linkedin_connected=true` : `${appUrl}/accounts?connected=linkedin`
  const errorBase = from ? `${appUrl}/${from}` : `${appUrl}/accounts`

  if (!verified) return NextResponse.redirect(`${appUrl}/accounts?error=invalid_state`)
  if (!code || !userId) return NextResponse.redirect(`${errorBase}?error=cancelled`)

  try {
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${appUrl}/api/linkedin/callback`,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error(tokenData.error_description ?? "Token inválido")

    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = await profileRes.json()
    const personId = profile.sub as string
    const displayName = profile.name ?? profile.given_name ?? "LinkedIn Account"
    const personUrn = `urn:li:person:${personId}`

    const clientId = await getActiveClientId(userId)

    await db
      .insert(instagramAccount)
      .values({
        id: generateId(),
        userId,
        clientId,
        platform: "linkedin",
        conta: displayName,
        pageName: displayName,
        pageId: personId,
        platformAccountId: personUrn,
        pageAccessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        active: true,
      })
      .onConflictDoUpdate({
        target: [instagramAccount.userId, instagramAccount.clientId, instagramAccount.platform, instagramAccount.pageId],
        set: {
          clientId,
          pageAccessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token ?? null,
          pageName: displayName,
          platformAccountId: personUrn,
          updatedAt: new Date(),
          lastRefreshError: null,
          lastRefreshErrorAt: null,
        },
      })

    return NextResponse.redirect(successUrl)
  } catch (e) {
    console.error("LinkedIn callback error:", e)
    return NextResponse.redirect(`${errorBase}?error=failed`)
  }
}
