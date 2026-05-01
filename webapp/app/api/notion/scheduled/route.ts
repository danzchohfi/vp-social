import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection, fieldMapping, instagramAccount } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"

type PlatformCheck = { platform: string; configured: boolean; pageName?: string | null }

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id

  const [connections, accounts] = await Promise.all([
    db.select().from(notionConnection).where(eq(notionConnection.userId, userId)),
    db.select().from(instagramAccount).where(eq(instagramAccount.userId, userId)),
  ])

  const configured = connections.filter((c) => c.databaseId)
  if (!configured.length) return NextResponse.json({ posts: [], configured: false })

  const accountMap = new Map(
    accounts.filter((a) => a.active).map((a) => [`${a.platform.toLowerCase()}:${a.conta.toLowerCase()}`, a])
  )

  const allPosts = await Promise.allSettled(
    configured.map(async (connection) => {
      const [mappingRow] = await db
        .select()
        .from(fieldMapping)
        .where(and(eq(fieldMapping.connectionId, connection.id), eq(fieldMapping.userId, userId)))

      const mapping = mappingRow ?? DEFAULT_MAPPING
      const notion = createNotionClient(connection.accessToken)
      const posts = await notion.getScheduledPosts(connection.databaseId!, mapping)
      return posts.map((p) => {
        const plataformas = p.plataformas?.length ? p.plataformas : ["instagram"]
        const accountChecks: PlatformCheck[] = plataformas.map((plat) => {
          const key = `${plat.toLowerCase()}:${p.conta?.toLowerCase() ?? ""}`
          const account = accountMap.get(key)
          return { platform: plat, configured: !!account, pageName: account?.pageName ?? null }
        })
        return { ...p, workspaceName: connection.workspaceName, connectionId: connection.id, accountChecks }
      })
    })
  )

  const posts = allPosts
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => {
      if (!a.scheduledDate) return 1
      if (!b.scheduledDate) return -1
      return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
    })

  return NextResponse.json({ posts, configured: true })
}
