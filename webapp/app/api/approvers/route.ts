import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { approver, productionApprover, production, approvalLink } from "@/lib/db/schema"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { findOrCreateApprover } from "@/lib/approvers"
import { listAccessibleClients } from "@/lib/active-client"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const accessibleClients = await listAccessibleClients(session.user.id)
  const ownerIds = Array.from(new Set([
    session.user.id,
    ...accessibleClients.map((c) => c.userId),
  ]))

  const rows = await db
    .select()
    .from(approver)
    .where(inArray(approver.userId, ownerIds))
    .orderBy(asc(approver.name))

  const approverIds = rows.map((r) => r.id)
  const clientIds = accessibleClients.map((c) => c.id)
  const usage = approverIds.length > 0 && clientIds.length > 0
    ? await db
        .select({
          approverId: productionApprover.approverId,
          productionId: productionApprover.productionId,
        })
        .from(productionApprover)
        .innerJoin(production, eq(production.id, productionApprover.productionId))
        .where(and(
          inArray(productionApprover.approverId, approverIds),
          inArray(production.clientId, clientIds),
        ))
    : []

  const usageCount = new Map<string, number>()
  for (const u of usage) {
    usageCount.set(u.approverId, (usageCount.get(u.approverId) ?? 0) + 1)
  }

  // Wave 3: also count pending post approvalLinks linked to each
  // approver (cron does phone-match in /lib/approvers.findApproverByPhone).
  // Shown separately so the roster row can distinguish "5 produções"
  // from "3 posts" — same approver, different work types.
  const postUsage = approverIds.length > 0 && clientIds.length > 0
    ? await db
        .select({ approverId: approvalLink.approverId })
        .from(approvalLink)
        .where(and(
          eq(approvalLink.kind, "post"),
          inArray(approvalLink.approverId, approverIds),
          inArray(approvalLink.clientId, clientIds),
          isNull(approvalLink.decision),
        ))
    : []
  const postUsageCount = new Map<string, number>()
  for (const u of postUsage) {
    if (!u.approverId) continue
    postUsageCount.set(u.approverId, (postUsageCount.get(u.approverId) ?? 0) + 1)
  }

  return NextResponse.json({
    approvers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      magicToken: r.magicToken,
      magicTokenIssuedAt: r.magicTokenIssuedAt,
      notes: r.notes,
      usageCount: usageCount.get(r.id) ?? 0,
      postPendingCount: postUsageCount.get(r.id) ?? 0,
      createdAt: r.createdAt,
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json().catch(() => null)) as
    | { name?: string; email?: string; phone?: string; role?: string; notes?: string }
    | null
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name obrigatório" }, { status: 400 })
  }

  const accessible = await listAccessibleClients(session.user.id)
  const ownerId = accessible[0]?.userId ?? session.user.id

  const created = await findOrCreateApprover(db, {
    userId: ownerId,
    name: body.name.trim(),
    email: body.email?.trim() ?? null,
    phone: body.phone?.trim() ?? null,
    role: body.role,
    notes: body.notes?.trim() ?? null,
  })

  return NextResponse.json({ approver: created }, { status: 201 })
}
