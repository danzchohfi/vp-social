import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
].join(",")

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const from = new URL(req.url).searchParams.get("from") ?? ""
  const state = from ? `${session.user.id}:${from}` : session.user.id

  const appUrl = new URL(req.url).origin
  const appId = process.env.FACEBOOK_APP_ID
  const redirectUri = encodeURIComponent(`${appUrl}/api/facebook/callback`)

  const url =
    `https://www.facebook.com/v19.0/dialog/oauth` +
    `?client_id=${appId}` +
    `&redirect_uri=${redirectUri}` +
    `&scope=${SCOPES}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(state)}`

  return NextResponse.json({ url })
}
