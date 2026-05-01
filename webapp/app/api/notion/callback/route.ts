import { db } from "@/lib/db"
import { notionConnection } from "@/lib/db/schema"
import { generateId } from "@/lib/utils"
import { getActiveClientId } from "@/lib/active-client"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const rawState = searchParams.get("state") ?? ""
  const [userId, from] = rawState.split(":")
  const appUrl = new URL(req.url).origin

  const successUrl = from ? `${appUrl}/${from}?notion_connected=true` : `${appUrl}/settings?connected=true`
  const errorBase = from ? `${appUrl}/${from}` : `${appUrl}/settings`

  if (!code || !userId) return NextResponse.redirect(`${errorBase}?error=cancelled`)

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
        redirect_uri: `${new URL(req.url).origin}/api/notion/callback`,
      }),
    })

    const data = await tokenRes.json()
    if (!data.access_token) throw new Error(data.error ?? "Token inválido")

    const clientId = await getActiveClientId(userId)

    await db
      .insert(notionConnection)
      .values({
        id: generateId(),
        userId,
        clientId,
        accessToken: data.access_token,
        workspaceId: data.workspace_id,
        workspaceName: data.workspace_name,
        workspaceIcon: data.workspace_icon ?? null,
      })
      .onConflictDoUpdate({
        target: [notionConnection.userId, notionConnection.clientId, notionConnection.workspaceId],
        set: {
          clientId,
          accessToken: data.access_token,
          workspaceName: data.workspace_name,
          workspaceIcon: data.workspace_icon ?? null,
          updatedAt: new Date(),
        },
      })

    return NextResponse.redirect(successUrl)
  } catch (e) {
    console.error("Notion callback error:", e)
    return NextResponse.redirect(`${errorBase}?error=failed`)
  }
}
