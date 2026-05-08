import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { production, productionApprover, approver, productionComment } from "@/lib/db/schema"
import { and, asc, eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userHasClientAccess, userIsClientOwner } from "@/lib/active-client"
import { canTransition, summarizeProduction, type ProductionStatus, PRODUCTION_STATUSES } from "@/lib/productions"

async function loadAndAuthorize(userId: string, productionId: string) {
  const [row] = await db.select().from(production).where(eq(production.id, productionId))
  if (!row) return { error: "Produção não encontrada" as const, status: 404 as const }
  const ok = await userHasClientAccess(userId, row.clientId)
  if (!ok) return { error: "Sem acesso a esta produção" as const, status: 403 as const }
  return { row }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const result = await loadAndAuthorize(session.user.id, id)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const { row } = result

  const chainRows = await db
    .select({
      stepOrder: productionApprover.stepOrder,
      approverId: productionApprover.approverId,
    })
    .from(productionApprover)
    .where(eq(productionApprover.productionId, id))
    .orderBy(asc(productionApprover.stepOrder))

  const approverIds = chainRows.map((r) => r.approverId)
  const approvers = approverIds.length > 0
    ? await db
        .select({ id: approver.id, name: approver.name, email: approver.email, phone: approver.phone, role: approver.role, magicToken: approver.magicToken })
        .from(approver)
        .where(inArray(approver.id, approverIds))
    : []
  const approverById = new Map(approvers.map((a) => [a.id, a]))

  const chain = chainRows.map((r) => ({
    stepOrder: r.stepOrder,
    approver: approverById.get(r.approverId) ?? { id: r.approverId, name: "(removido)", email: null, phone: null, role: "client", magicToken: "" },
  }))

  const comments = await db
    .select()
    .from(productionComment)
    .where(eq(productionComment.productionId, id))
    .orderBy(asc(productionComment.createdAt))

  return NextResponse.json({
    production: {
      ...summarizeProduction(row),
      topic: row.topic,
      specialistContactName: row.specialistContactName,
      specialistContactEmail: row.specialistContactEmail,
      specialistContactPhone: row.specialistContactPhone,
      briefJson: row.briefJson,
      scriptJson: row.scriptJson,
      finalVideoUrl: row.finalVideoUrl,
      notionPageId: row.notionPageId,
      clientId: row.clientId,
    },
    chain,
    comments,
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const result = await loadAndAuthorize(session.user.id, id)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const current = result.row

  const body = (await req.json().catch(() => null)) as
    | {
        title?: string
        type?: string
        topic?: string | null
        specialistName?: string | null
        specialistContactName?: string | null
        specialistContactEmail?: string | null
        specialistContactPhone?: string | null
        briefJson?: string | null
        scriptJson?: string | null
        status?: ProductionStatus
        recordingDate?: string | null
        deliveryDate?: string | null
        publishDate?: string | null
        finalVideoUrl?: string | null
        approverIds?: string[]
      }
    | null
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 })
  }

  if (body.status && body.status !== current.status) {
    if (!PRODUCTION_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "status inválido" }, { status: 400 })
    }
    if (!canTransition(current.status as ProductionStatus, body.status, "agency")) {
      return NextResponse.json(
        { error: `Transição ${current.status} → ${body.status} não permitida` },
        { status: 400 },
      )
    }
  }

  const update: Partial<typeof production.$inferInsert> = { updatedAt: new Date() }
  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim()
  if (typeof body.type === "string") update.type = body.type
  if ("topic" in body) update.topic = body.topic ?? null
  if ("specialistName" in body) update.specialistName = body.specialistName ?? null
  if ("specialistContactName" in body) update.specialistContactName = body.specialistContactName ?? null
  if ("specialistContactEmail" in body) update.specialistContactEmail = body.specialistContactEmail ?? null
  if ("specialistContactPhone" in body) update.specialistContactPhone = body.specialistContactPhone ?? null
  if ("briefJson" in body) update.briefJson = body.briefJson ?? null
  if ("scriptJson" in body) update.scriptJson = body.scriptJson ?? null
  if (body.status) update.status = body.status
  if ("recordingDate" in body) update.recordingDate = body.recordingDate ? new Date(body.recordingDate) : null
  if ("deliveryDate" in body) update.deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : null
  if ("publishDate" in body) update.publishDate = body.publishDate ? new Date(body.publishDate) : null
  if ("finalVideoUrl" in body) update.finalVideoUrl = body.finalVideoUrl ?? null

  await db.update(production).set(update).where(eq(production.id, id))

  if (Array.isArray(body.approverIds)) {
    const ids = body.approverIds.filter((s) => typeof s === "string")
    if (ids.length > 0) {
      const [client] = await db
        .select()
        .from(production)
        .where(eq(production.id, id))
      const found = await db
        .select({ id: approver.id, userId: approver.userId })
        .from(approver)
        .where(inArray(approver.id, ids))
      const ok = found.length === ids.length && found.every((a) => a.userId === current.userId || a.userId === client.userId)
      if (!ok) return NextResponse.json({ error: "approverIds inválidos" }, { status: 400 })
    }
    await db.delete(productionApprover).where(eq(productionApprover.productionId, id))
    if (ids.length > 0) {
      await db.insert(productionApprover).values(
        ids.map((approverId, idx) => ({ productionId: id, approverId, stepOrder: idx + 1 }))
      )
    }
  }

  const [refreshed] = await db.select().from(production).where(eq(production.id, id))
  return NextResponse.json({ production: summarizeProduction(refreshed) })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const result = await loadAndAuthorize(session.user.id, id)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const isOwner = await userIsClientOwner(session.user.id, result.row.clientId)
  if (!isOwner) {
    return NextResponse.json({ error: "Apenas o owner pode deletar produções" }, { status: 403 })
  }

  await db.delete(production).where(eq(production.id, id))
  return NextResponse.json({ ok: true })
}
