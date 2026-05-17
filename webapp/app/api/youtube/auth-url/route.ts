import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createOAuthState } from "@/lib/oauth-state"

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ")

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const from = new URL(req.url).searchParams.get("from") ?? ""
  const state = await createOAuthState(session.user.id, from)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!appUrl || !clientId) return NextResponse.json({ error: "YouTube not configured" }, { status: 503 })

  const redirectUri = `${appUrl}/api/youtube/callback`

  const url =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${encodeURIComponent(state)}`

  return NextResponse.json({ url })
}
