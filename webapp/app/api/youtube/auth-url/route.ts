import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ")

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const from = new URL(req.url).searchParams.get("from") ?? ""
  const state = from ? `${session.user.id}:${from}` : session.user.id

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const clientId = process.env.GOOGLE_CLIENT_ID

  const url =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${clientId}` +
    `&redirect_uri=${appUrl}/api/youtube/callback` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${encodeURIComponent(state)}`

  return NextResponse.json({ url })
}
