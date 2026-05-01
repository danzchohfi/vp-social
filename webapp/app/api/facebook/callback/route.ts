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
  const appUrl = new URL(req.url).origin

  const successUrl = from ? `${appUrl}/${from}?instagram_connected=true` : `${appUrl}/accounts?connected=instagram`
  const errorBase = from ? `${appUrl}/${from}` : `${appUrl}/accounts`

  if (!code || !userId) return NextResponse.redirect(`${errorBase}?error=cancelled`)

  try {
    const redirectUri = `${appUrl}/api/facebook/callback`
    const tokenRes = await fetch(`${GRAPH}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID ?? "",
        client_secret: process.env.FACEBOOK_APP_SECRET ?? "",
        redirect_uri: redirectUri,
        code,
      }),
    })
    const tokenData = await tokenRes.json()
    console.log("Facebook token response:", JSON.stringify(tokenData))
    if (!tokenData.access_token) throw new Error(tokenData.error?.message ?? "Token inválido")

    const longRes = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    )
    const longData = await longRes.json()
    console.log("Facebook long-lived token response:", JSON.stringify(longData))
    if (!longData.access_token) throw new Error(longData.error?.message ?? "Token long-lived inválido")

    const meRes = await fetch(`${GRAPH}/me?fields=id,name&access_token=${longData.access_token}`)
    const meData = await meRes.json()
    console.log("Facebook me:", JSON.stringify(meData))

    const permRes = await fetch(`${GRAPH}/me/permissions?access_token=${longData.access_token}`)
    const permData = await permRes.json()
    console.log("Facebook permissions:", JSON.stringify(permData))

    const pagesRes = await fetch(
      `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longData.access_token}`
    )
    const pagesData = await pagesRes.json()
    console.log("Facebook pages response:", JSON.stringify(pagesData))
    const { data: pages } = pagesData

    let connected = 0
    for (const page of pages ?? []) {
      const ig = page.instagram_business_account

      // Save as Facebook Page account
      await db
        .insert(instagramAccount)
        .values({
          id: generateId(),
          userId,
          platform: "facebook",
          conta: page.name,
          pageName: page.name,
          pageId: page.id,
          pageAccessToken: page.access_token,
          active: true,
        })
        .onConflictDoUpdate({
          target: [instagramAccount.userId, instagramAccount.platform, instagramAccount.pageId],
          set: {
            pageAccessToken: page.access_token,
            pageName: page.name,
            updatedAt: new Date(),
          },
        })

      // Also save as Instagram account if this page has an Instagram Business Account
      if (ig) {
        await db
          .insert(instagramAccount)
          .values({
            id: generateId(),
            userId,
            platform: "instagram",
            conta: page.name,
            pageName: page.name,
            pageId: page.id,
            instagramBusinessAccountId: ig.id,
            platformAccountId: ig.id,
            pageAccessToken: page.access_token,
            active: true,
          })
          .onConflictDoUpdate({
            target: [instagramAccount.userId, instagramAccount.platform, instagramAccount.pageId],
            set: {
              pageAccessToken: page.access_token,
              pageName: page.name,
              instagramBusinessAccountId: ig.id,
              platformAccountId: ig.id,
              updatedAt: new Date(),
            },
          })
        connected++
      }
    }

    if (connected === 0 && (pages ?? []).length === 0) {
      return NextResponse.redirect(`${errorBase}?error=no_pages`)
    }

    return NextResponse.redirect(successUrl)
  } catch (e) {
    console.error("Facebook callback error:", e)
    return NextResponse.redirect(`${errorBase}?error=failed`)
  }
}
