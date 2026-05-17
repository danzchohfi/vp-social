import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createOAuthState } from "@/lib/oauth-state"

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const from = new URL(req.url).searchParams.get("from") ?? ""
  // Nonce 256-bit gravado em cookie httpOnly; callback verifica. userId
  // vem da SESSÃO autenticada, nunca da URL/state.
  const state = await createOAuthState(session.user.id, from)

  const appUrl = new URL(req.url).origin
  const clientId = process.env.NOTION_CLIENT_ID
  const redirectUri = encodeURIComponent(`${appUrl}/api/notion/callback`)

  const url =
    `https://api.notion.com/v1/oauth/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&owner=user` +
    `&state=${encodeURIComponent(state)}`

  // ?redirect=1: instead of returning JSON, send a 302 straight to
  // Notion's OAuth screen. Used by setup-checklist "Gerenciar" so a
  // plain <a href> click takes the user into Notion's page-picker
  // where they can add the integration to more DBs (e.g. Contatos)
  // without us needing client-side fetch + window.location wiring.
  if (new URL(req.url).searchParams.get("redirect") === "1") {
    return NextResponse.redirect(url)
  }

  return NextResponse.json({ url })
}
