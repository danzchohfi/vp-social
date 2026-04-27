import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const clientId = process.env.NOTION_CLIENT_ID

  const url =
    `https://api.notion.com/v1/oauth/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${appUrl}/api/notion/callback` +
    `&response_type=code` +
    `&owner=user` +
    `&state=${session.user.id}`

  return NextResponse.json({ url })
}
