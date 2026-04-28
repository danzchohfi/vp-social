import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

const SCOPES = ["openid", "profile", "w_member_social"].join(" ")

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const clientId = process.env.LINKEDIN_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: "LinkedIn not configured" }, { status: 503 })

  const from = new URL(req.url).searchParams.get("from") ?? ""
  const state = from ? `${session.user.id}:${from}` : session.user.id

  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  const url =
    `https://www.linkedin.com/oauth/v2/authorization` +
    `?response_type=code` +
    `&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(`${appUrl}/api/linkedin/callback`)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&state=${encodeURIComponent(state)}`

  return NextResponse.json({ url })
}
