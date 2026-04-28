import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const clientKey = process.env.TIKTOK_CLIENT_KEY
  if (!clientKey) return NextResponse.json({ error: "TikTok not configured" }, { status: 503 })

  const from = new URL(req.url).searchParams.get("from") ?? ""
  const state = from ? `${session.user.id}:${from}` : session.user.id

  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const url =
    `https://www.tiktok.com/v2/auth/authorize/` +
    `?client_key=${clientKey}` +
    `&response_type=code` +
    `&scope=user.info.basic,video.publish,video.upload` +
    `&redirect_uri=${encodeURIComponent(`${appUrl}/api/tiktok/callback`)}` +
    `&state=${encodeURIComponent(state)}`

  return NextResponse.json({ url })
}
