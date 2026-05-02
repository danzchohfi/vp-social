import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection, fieldMapping, instagramAccount } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING } from "@/lib/notion"
import { getActiveClientId } from "@/lib/active-client"

type TargetCheck = { raw: string; platform: string; tipo: string; configured: boolean; pageName?: string | null }

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const clientId = await getActiveClientId(session.user.id)

  const [connections, accounts] = await Promise.all([
    db.select().from(notionConnection).where(eq(notionConnection.clientId, clientId)),
    db.select().from(instagramAccount).where(eq(instagramAccount.clientId, clientId)),
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
        .where(eq(fieldMapping.connectionId, connection.id))

      const mapping = mappingRow ?? DEFAULT_MAPPING
      const notion = createNotionClient(connection.accessToken)
      const posts = await notion.getScheduledPosts(connection.databaseId!, mapping)
      return posts.map((p) => {
        const targetChecks: TargetCheck[] = p.publishTargets.map((t) => {
          const key = `${t.platform}:${p.conta?.toLowerCase() ?? ""}`
          const account = accountMap.get(key)
          return {
            raw: t.raw,
            platform: t.platform,
            tipo: t.tipo,
            configured: !!account,
            pageName: account?.pageName ?? null,
          }
        })
        return { ...p, workspaceName: connection.workspaceName, connectionId: connection.id, targetChecks }
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
