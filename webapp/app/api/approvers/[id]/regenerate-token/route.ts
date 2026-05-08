import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { approver } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { regenerateMagicToken } from "@/lib/approvers"
import { listAccessibleClients } from "@/lib/active-client"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const [row] = await db.select().from(approver).where(eq(approver.id, id))
  if (!row) return NextResponse.json({ error: "Approver não encontrado" }, { status: 404 })

  const accessible = await listAccessibleClients(session.user.id)
  const ok = row.userId === session.user.id || accessible.some((c) => c.userId === row.userId)
  if (!ok) return NextResponse.json({ error: "Sem acesso a este approver" }, { status: 403 })

  const { approver: updated, newToken } = await regenerateMagicToken(db, id)
  return NextResponse.json({ approver: updated, newToken })
}
