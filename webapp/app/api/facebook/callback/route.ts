import { db } from "@/lib/db"
import { instagramAccount } from "@/lib/db/schema"
import { generateId } from "@/lib/utils"
import { getActiveClientId } from "@/lib/active-client"
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
    if (!tokenData.access_token) throw new Error(tokenData.error?.message ?? "Token inválido")

    const longRes = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
    )
    const longData = await longRes.json()
    if (!longData.access_token) throw new Error(longData.error?.message ?? "Token long-lived inválido")

    // /me apenas pra validar token — não logamos (continha access_token nas
    // versões anteriores deste arquivo). Mantemos a chamada caso o Graph
    // exija contexto-de-usuário pra rotas downstream.
    await fetch(`${GRAPH}/me?fields=id,name&access_token=${longData.access_token}`)

    // Try /me/accounts first
    const pagesRes = await fetch(
      `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longData.access_token}`
    )
    const pagesData = await pagesRes.json()
    let pages: any[] = pagesData.data ?? []

    // Fallback: use Business Management API for pages managed via Business Manager
    if (pages.length === 0) {
      const bizRes = await fetch(`${GRAPH}/me/businesses?access_token=${longData.access_token}`)
      const bizData = await bizRes.json()

      for (const biz of bizData.data ?? []) {
        const bizPagesRes = await fetch(
          `${GRAPH}/${biz.id}/owned_pages?fields=id,name,access_token,instagram_business_account&access_token=${longData.access_token}`
        )
        const bizPagesData = await bizPagesRes.json()
        pages = [...pages, ...(bizPagesData.data ?? [])]

        const clientPagesRes = await fetch(
          `${GRAPH}/${biz.id}/client_pages?fields=id,name,access_token,instagram_business_account&access_token=${longData.access_token}`
        )
        const clientPagesData = await clientPagesRes.json()
        pages = [...pages, ...(clientPagesData.data ?? [])]
      }
    }

    const clientId = await getActiveClientId(userId)
    let connected = 0
    // Save new pages as inactive ("pending"). The frontend then prompts the
    // user to pick which of these pages actually belong to this client; the
    // unselected ones are deleted via /api/accounts/pending. The upsert's
    // set clause intentionally doesn't touch `active`, so previously-
    // confirmed pages on this client keep their active state on re-OAuth.
    for (const page of pages) {
      const ig = page.instagram_business_account

      await db
        .insert(instagramAccount)
        .values({
          id: generateId(),
          userId,
          clientId,
          platform: "facebook",
          conta: page.name,
          pageName: page.name,
          pageId: page.id,
          pageAccessToken: page.access_token,
          active: false,
        })
        .onConflictDoUpdate({
          target: [instagramAccount.userId, instagramAccount.clientId, instagramAccount.platform, instagramAccount.pageId],
          set: {
            clientId,
            pageAccessToken: page.access_token,
            pageName: page.name,
            updatedAt: new Date(),
            lastRefreshError: null,
            lastRefreshErrorAt: null,
          },
        })

      if (ig) {
        await db
          .insert(instagramAccount)
          .values({
            id: generateId(),
            userId,
            clientId,
            platform: "instagram",
            conta: page.name,
            pageName: page.name,
            pageId: page.id,
            instagramBusinessAccountId: ig.id,
            platformAccountId: ig.id,
            pageAccessToken: page.access_token,
            active: false,
          })
          .onConflictDoUpdate({
            target: [instagramAccount.userId, instagramAccount.clientId, instagramAccount.platform, instagramAccount.pageId],
            set: {
              clientId,
              pageAccessToken: page.access_token,
              pageName: page.name,
              instagramBusinessAccountId: ig.id,
              platformAccountId: ig.id,
              updatedAt: new Date(),
              lastRefreshError: null,
              lastRefreshErrorAt: null,
            },
          })
        connected++
      }
    }

    if (connected === 0 && pages.length === 0) {
      return NextResponse.redirect(`${errorBase}?error=no_pages`)
    }

    return NextResponse.redirect(successUrl)
  } catch (e) {
    console.error("Facebook callback error:", e)
    return NextResponse.redirect(`${errorBase}?error=failed`)
  }
}
