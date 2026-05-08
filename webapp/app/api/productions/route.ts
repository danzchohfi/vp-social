import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { production, productionApprover, approver } from "@/lib/db/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { getActiveClient, getActiveClientScope, userHasClientAccess } from "@/lib/active-client"
import { summarizeProduction, type ProductionStatus, PRODUCTION_STATUSES } from "@/lib/productions"
import { generateId } from "@/lib/utils"

// ─── GET — list productions ─────────────────────────────────
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const statusFilter = url.searchParams.get("status") as ProductionStatus | null

  const scope = await getActiveClientScope(session.user.id)
  const clientIds = scope.mode === "all" ? scope.clients.map((c) => c.id) : [scope.client.id]

  const conditions = [inArray(production.clientId, clientIds)]
  if (statusFilter && PRODUCTION_STATUSES.includes(statusFilter)) {
    conditions.push(eq(production.status, statusFilter))
  }

  const rows = await db
    .select()
    .from(production)
    .where(and(...conditions))
    .orderBy(desc(production.createdAt))

  return NextResponse.json({
    productions: rows.map(summarizeProduction),
    agencyMode: scope.mode === "all",
  })
}

// ─── POST — create production ──────────────────────────────
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json().catch(() => null)) as
    | {
        title?: string
        type?: string
        topic?: string
        specialistName?: string
        specialistContactName?: string
        specialistContactEmail?: string
        specialistContactPhone?: string
        status?: ProductionStatus
        approverIds?: string[]
      }
    | null
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "title obrigatório" }, { status: 400 })
  }

  const activeClient = await getActiveClient(session.user.id)
  if (!activeClient) {
    return NextResponse.json({ error: "Sem cliente ativo" }, { status: 400 })
  }

  const status: ProductionStatus = (body.status && PRODUCTION_STATUSES.includes(body.status))
    ? body.status
    : "script_drafting"

  const approverIds = Array.isArray(body.approverIds) ? body.approverIds.filter((s) => typeof s === "string") : []
  if (approverIds.length > 0) {
    const found = await db
      .select({ id: approver.id, userId: approver.userId })
      .from(approver)
      .where(inArray(approver.id, approverIds))
    const valid = found.every((a) => a.userId === activeClient.userId)
    if (!valid || found.length !== approverIds.length) {
      return NextResponse.json({ error: "approverIds inválidos para esta agência" }, { status: 400 })
    }
  }

  const newId = generateId()
  await db.insert(production).values({
    id: newId,
    clientId: activeClient.id,
    userId: session.user.id,
    type: body.type ?? "video",
    title: body.title.trim(),
    topic: body.topic ?? null,
    specialistName: body.specialistName ?? null,
    specialistContactName: body.specialistContactName ?? null,
    specialistContactEmail: body.specialistContactEmail ?? null,
    specialistContactPhone: body.specialistContactPhone ?? null,
    status,
  })

  if (approverIds.length > 0) {
    await db.insert(productionApprover).values(
      approverIds.map((approverId, idx) => ({
        productionId: newId,
        approverId,
        stepOrder: idx + 1,
      }))
    )
  }

  const [created] = await db.select().from(production).where(eq(production.id, newId))
  const ok = await userHasClientAccess(session.user.id, created.clientId)
  if (!ok) return NextResponse.json({ error: "Sem acesso ao cliente desta produção" }, { status: 403 })

  return NextResponse.json({ production: summarizeProduction(created) }, { status: 201 })
}
