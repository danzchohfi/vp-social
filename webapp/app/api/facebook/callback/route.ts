import { db } from "@/lib/db"
import { instagramAccount } from "@/lib/db/schema"
import { generateId } from "@/lib/utils"
import { NextResponse } from "next/server"

const GRAPH = "https://graph.facebook.com/v19.0"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const rawState = searchParams.get("state") ?? ""
  const [userId, from] = rawState.split(":")
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const successUrl = from ? `${appUrl}/${from}?instagram_connected=true` : `${appUrl}/accounts?connected=true`
  const errorBase = from ? `${appUrl}/${from}` : `${appUrl}/accounts`

  if (!code || !userId) return NextResponse.redirect(`${errorBase}?error=cancelled`)

  try {
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&redirect_uri=${appUrl}/api/facebook/callback&code=${code}`
    )
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error(tokenData.error?.message ?? "Token inválido")

    const longRes = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    )
    const longData = await longRes.json()
    if (!longData.access_token) throw new Error(longData.error?.message ?? "Token long-lived inválido")

    const pagesRes = await fetch(
      `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longData.access_token}`
    )
    const { data: pages } = await pagesRes.json()

    let connected = 0
    for (const page of pages ?? []) {
      const ig = page.instagram_business_account
      if (!ig) continue

      await db
        .insert(instagramAccount)
        .values({
          id: generateId(),
          userId,
          conta: page.name,
          pageName: page.name,
          pageId: page.id,
          instagramBusinessAccountId: ig.id,
          pageAccessToken: page.access_token,
          active: true,
        })
        .onConflictDoUpdate({
          target: [instagramAccount.userId, instagramAccount.pageId],
          set: {
            pageAccessToken: page.access_token,
            pageName: page.name,
            updatedAt: new Date(),
          },
        })
      connected++
    }

    if (connected === 0) {
      return NextResponse.redirect(`${errorBase}?error=no_instagram`)
    }

    return NextResponse.redirect(successUrl)
  } catch (e) {
    console.error("Facebook callback error:", e)
    return NextResponse.redirect(`${errorBase}?error=failed`)
  }
}
