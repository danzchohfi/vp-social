import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
].join(",")

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const appId = process.env.FACEBOOK_APP_ID

  const url =
    `https://www.facebook.com/v19.0/dialog/oauth` +
    `?client_id=${appId}` +
    `&redirect_uri=${appUrl}/api/facebook/callback` +
    `&scope=${SCOPES}` +
    `&response_type=code` +
    `&state=${session.user.id}`

  return NextResponse.json({ url })
}
