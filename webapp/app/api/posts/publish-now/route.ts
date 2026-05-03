import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection, fieldMapping, instagramAccount } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { publishToPlatform, saveLog } from "@/lib/publisher"

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const { pageId, connectionId } = await req.json()
  if (!pageId || !connectionId) {
    return NextResponse.json({ error: "pageId e connectionId obrigatórios" }, { status: 400 })
  }

  const [connection] = await db
    .select()
    .from(notionConnection)
    .where(and(eq(notionConnection.id, connectionId), eq(notionConnection.userId, userId)))

  if (!connection?.databaseId) {
    return NextResponse.json({ error: "Conexão não encontrada ou sem banco" }, { status: 404 })
  }

  const [mappingRow] = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, connectionId))

  const mapping = mappingRow ?? DEFAULT_MAPPING
  const notion = createNotionClient(connection.accessToken)

  const posts = await notion.getReadyPosts(connection.databaseId, mapping)
  const post = posts.find((p) => p.pageId === pageId)
  if (!post) {
    return NextResponse.json(
      { error: "Post não encontrado ou ainda não está pronto para publicação" },
      { status: 404 }
    )
  }

  const accounts = await db
    .select()
    .from(instagramAccount)
    .where(and(
      eq(instagramAccount.userId, userId),
      connection.clientId
        ? eq(instagramAccount.clientId, connection.clientId)
        : eq(instagramAccount.userId, userId)
    ))

  const accountMap = new Map(
    accounts.filter((a) => a.active).map((a) => [`${a.platform.toLowerCase()}:${a.conta.toLowerCase()}`, a])
  )

  const results: Array<{ platform: string; status: "published" | "failed" | "skipped"; postId?: string; postUrl?: string | null; error?: string }> = []
  let anyPublished = false
  // Collect all published-platform URLs so we can write them to the Notion
  // link field as a single rich_text block. Multiple platforms otherwise
  // overwrite each other.
  const publishedLinks: Array<{ platform: string; url: string }> = []

  if (!post.publishTargets.length) {
    return NextResponse.json(
      { error: 'O campo "Publicar em" está vazio neste post' },
      { status: 400 }
    )
  }

  for (const target of post.publishTargets) {
    const key = `${target.platform}:${post.conta.toLowerCase()}`
    const account = accountMap.get(key)

    if (!account) {
      const msg = `Conta "${post.conta}" não configurada para ${target.platform}`
      await saveLog(db, userId, connectionId, post, null, null, target.raw, "skipped", msg, connection.clientId)
      results.push({ platform: target.raw, status: "skipped", error: msg })
      continue
    }

    try {
      const { id: postId, url: postUrl } = await publishToPlatform(target.platform, target.tipo, account, post)
      await saveLog(db, userId, connectionId, post, postId, postUrl, target.raw, "published", null, connection.clientId)
      if (postUrl) publishedLinks.push({ platform: target.raw, url: postUrl })
      results.push({ platform: target.raw, status: "published", postId, postUrl })
      anyPublished = true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await saveLog(db, userId, connectionId, post, null, null, target.raw, "failed", message, connection.clientId)
      results.push({ platform: target.raw, status: "failed", error: message })
    }
  }

  try {
    if (publishedLinks.length > 0) {
      await notion.setPostUrls(post.pageId, mapping, publishedLinks)
    }
    if (anyPublished) await notion.markPublished(post.pageId, mapping)
    else await notion.markFailed(post.pageId, mapping)
  } catch {}

  return NextResponse.json({ results, post: { title: post.title, conta: post.conta } })
}
