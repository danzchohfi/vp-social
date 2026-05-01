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
    .where(eq(instagramAccount.userId, userId))

  const accountMap = new Map(
    accounts.filter((a) => a.active).map((a) => [`${a.platform.toLowerCase()}:${a.conta.toLowerCase()}`, a])
  )

  const plataformas = post.plataformas?.length ? post.plataformas : ["instagram"]
  const results: Array<{ platform: string; status: "published" | "failed" | "skipped"; postId?: string; error?: string }> = []
  let anyPublished = false

  for (const plataforma of plataformas) {
    const key = `${plataforma.toLowerCase()}:${post.conta.toLowerCase()}`
    const account = accountMap.get(key)

    if (!account) {
      const msg = `Conta "${post.conta}" não configurada para ${plataforma}`
      await saveLog(db, userId, connectionId, post, null, plataforma, "skipped", msg)
      results.push({ platform: plataforma, status: "skipped", error: msg })
      continue
    }

    try {
      const postId = await publishToPlatform(plataforma, account, post)
      await saveLog(db, userId, connectionId, post, postId, plataforma, "published", null)
      results.push({ platform: plataforma, status: "published", postId })
      anyPublished = true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await saveLog(db, userId, connectionId, post, null, plataforma, "failed", message)
      results.push({ platform: plataforma, status: "failed", error: message })
    }
  }

  try {
    if (anyPublished) await notion.markPublished(post.pageId, mapping)
    else await notion.markFailed(post.pageId, mapping)
  } catch {}

  return NextResponse.json({ results, post: { title: post.title, conta: post.conta } })
}
