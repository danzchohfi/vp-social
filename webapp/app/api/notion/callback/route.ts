import { db } from "@/lib/db"
import { notionConnection, fieldMapping } from "@/lib/db/schema"
import { generateId } from "@/lib/utils"
import { getActiveClientId } from "@/lib/active-client"
import { and, eq, ne } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const rawState = searchParams.get("state") ?? ""
  const [userId, from] = rawState.split(":")
  const appUrl = new URL(req.url).origin

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

    // Notion's owner=user OAuth creates a brand-new bot per authorization.
    // If the user already shared the workspace with a previous client's bot,
    // Notion's auth screen no longer prompts to re-share — so the new bot
    // would have zero page access. Detect that case and reuse the working
    // bot's token (plus its databaseId + mapping) so the new client lands
    // on a configured state.
    const [cloneSource] = await db
      .select()
      .from(notionConnection)
      .where(and(
        eq(notionConnection.userId, userId),
        eq(notionConnection.workspaceId, data.workspace_id),
        ne(notionConnection.clientId, clientId),
      ))
      .limit(1)

    const finalAccessToken = cloneSource?.accessToken ?? data.access_token
    const finalDatabaseId = cloneSource?.databaseId ?? null
    const finalDatabaseName = cloneSource?.databaseName ?? null

    await db
      .insert(notionConnection)
      .values({
        id: generateId(),
        userId,
        clientId,
        accessToken: finalAccessToken,
        workspaceId: data.workspace_id,
        workspaceName: data.workspace_name,
        workspaceIcon: data.workspace_icon ?? null,
        databaseId: finalDatabaseId,
        databaseName: finalDatabaseName,
      })
      .onConflictDoUpdate({
        // Same user+client+workspace re-OAuth: refresh token + workspace meta.
        // We don't overwrite databaseId here so a user re-authing to fix
        // access doesn't lose their picked database.
        target: [notionConnection.userId, notionConnection.clientId, notionConnection.workspaceId],
        set: {
          accessToken: finalAccessToken,
          workspaceName: data.workspace_name,
          workspaceIcon: data.workspace_icon ?? null,
          updatedAt: new Date(),
        },
      })

    // Clone the field mapping when we cloned the connection. Only on first
    // insert — if the new client already had a mapping (from a previous
    // partial setup) we keep it.
    if (cloneSource?.databaseId) {
      const [newConn] = await db
        .select()
        .from(notionConnection)
        .where(and(
          eq(notionConnection.userId, userId),
          eq(notionConnection.clientId, clientId),
          eq(notionConnection.workspaceId, data.workspace_id),
        ))
        .limit(1)

      if (newConn) {
        const [existing] = await db
          .select()
          .from(fieldMapping)
          .where(eq(fieldMapping.connectionId, newConn.id))
          .limit(1)

        if (!existing) {
          const [source] = await db
            .select()
            .from(fieldMapping)
            .where(eq(fieldMapping.connectionId, cloneSource.id))
            .limit(1)

          if (source) {
            const { id: _id, connectionId: _cid, userId: _uid, createdAt: _ca, updatedAt: _ua, ...mappingFields } = source
            await db.insert(fieldMapping).values({
              id: generateId(),
              userId,
              connectionId: newConn.id,
              ...mappingFields,
            })
          }
        }
      }
    }

    const successUrl = from
      ? `${appUrl}/${from}?notion_connected=true${cloneSource ? "&cloned=1" : ""}`
      : `${appUrl}/settings?connected=true${cloneSource ? "&cloned=1" : ""}`

    return NextResponse.redirect(successUrl)
  } catch (e) {
    console.error("Notion callback error:", e)
    return NextResponse.redirect(`${errorBase}?error=failed`)
  }
}
