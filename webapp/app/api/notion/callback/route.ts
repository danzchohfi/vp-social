import { db } from "@/lib/db"
import { notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { generateId } from "@/lib/utils"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const userId = searchParams.get("state")
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!code || !userId) return NextResponse.redirect(`${appUrl}/settings?error=cancelled`)

  try {
    const credentials = Buffer.from(
      `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
    ).toString("base64")

    const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${appUrl}/api/notion/callback`,
      }),
    })

    const data = await tokenRes.json()

    await db
      .insert(notionConnection)
      .values({
        id: generateId(),
        userId,
        accessToken: data.access_token,
        workspaceId: data.workspace_id,
        workspaceName: data.workspace_name,
        workspaceIcon: data.workspace_icon ?? null,
      })
      .onConflictDoNothing()

    return NextResponse.redirect(`${appUrl}/settings?connected=true`)
  } catch (e) {
    console.error(e)
    return NextResponse.redirect(`${appUrl}/settings?error=failed`)
  }
}
