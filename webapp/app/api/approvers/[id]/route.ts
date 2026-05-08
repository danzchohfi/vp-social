import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { approver } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { listAccessibleClients } from "@/lib/active-client"

async function loadAndAuthorize(userId: string, approverId: string) {
  const [row] = await db.select().from(approver).where(eq(approver.id, approverId))
  if (!row) return { error: "Approver não encontrado" as const, status: 404 as const }
  const accessible = await listAccessibleClients(userId)
  const hasAgencyAccess = accessible.some((c) => c.userId === row.userId) || row.userId === userId
  if (!hasAgencyAccess) return { error: "Sem acesso a este approver" as const, status: 403 as const }
  return { row }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const result = await loadAndAuthorize(session.user.id, id)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const body = (await req.json().catch(() => null)) as
    | { name?: string; email?: string | null; phone?: string | null; role?: string; notes?: string | null }
    | null
  if (!body) return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 })

  const update: Partial<typeof approver.$inferInsert> = { updatedAt: new Date() }
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim()
  if ("email" in body) update.email = body.email?.trim().toLowerCase() || null
  if ("phone" in body) update.phone = body.phone?.trim() || null
  if (typeof body.role === "string") update.role = body.role
  if ("notes" in body) update.notes = body.notes?.trim() || null

  await db.update(approver).set(update).where(eq(approver.id, id))
  const [refreshed] = await db.select().from(approver).where(eq(approver.id, id))
  return NextResponse.json({ approver: refreshed })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const result = await loadAndAuthorize(session.user.id, id)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })

  await db.delete(approver).where(eq(approver.id, id))
  return NextResponse.json({ ok: true })
}
