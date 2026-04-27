import { db } from "@/lib/db"
import { instagramAccount } from "@/lib/db/schema"
import { generateId } from "@/lib/utils"
import { NextResponse } from "next/server"

const GRAPH = "https://graph.facebook.com/v19.0"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const userId = searchParams.get("state")
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!code || !userId) return NextResponse.redirect(`${appUrl}/accounts?error=cancelled`)

  try {
    // Troca code por short-lived token
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&redirect_uri=${appUrl}/api/facebook/callback&code=${code}`
    )
    const { access_token: shortToken } = await tokenRes.json()

    // Troca por long-lived token (60 dias)
    const longRes = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&fb_exchange_token=${shortToken}`
    )
    const { access_token: longToken } = await longRes.json()

    // Busca páginas e contas Instagram
    const pagesRes = await fetch(
      `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longToken}`
    )
    const { data: pages } = await pagesRes.json()

    // Salva cada conta Instagram encontrada
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
        .onConflictDoNothing()
    }

    return NextResponse.redirect(`${appUrl}/accounts?connected=true`)
  } catch (e) {
    console.error(e)
    return NextResponse.redirect(`${appUrl}/accounts?error=failed`)
  }
}
