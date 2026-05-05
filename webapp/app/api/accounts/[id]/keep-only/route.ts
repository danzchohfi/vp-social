import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { instagramAccount } from "@/lib/db/schema"
import { and, eq, ne } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userHasClientAccess } from "@/lib/active-client"
import { syncAccountsToNotionAsync } from "@/lib/notion-account-sync"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const [target] = await db.select().from(instagramAccount).where(eq(instagramAccount.id, id))
  if (!target) return NextResponse.json({ error: "Não encontrada" }, { status: 404 })
  if (!target.clientId || !(await userHasClientAccess(session.user.id, target.clientId))) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 })
  }

  const result = await db
    .delete(instagramAccount)
    .where(and(
      eq(instagramAccount.clientId, target.clientId),
      eq(instagramAccount.platform, target.platform),
      ne(instagramAccount.id, id)
    ))
    .returning({ id: instagramAccount.id })

  await db
    .update(instagramAccount)
    .set({ active: true, updatedAt: new Date() })
    .where(eq(instagramAccount.id, id))

  syncAccountsToNotionAsync(session.user.id, target.clientId)

  return NextResponse.json({ ok: true, removed: result.length })
}
