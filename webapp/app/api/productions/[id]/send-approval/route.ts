import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  production,
  productionApprover,
  approvalLink,
  client as clientTable,
} from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userHasClientAccess } from "@/lib/active-client"
import { advanceChain, bumpRound, type ProductionStatus } from "@/lib/productions"
import { dispatchApprovalRequest, getUserWhatsappConfig } from "@/lib/whatsapp-dispatch"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://producao.app"

// POST /api/productions/[id]/send-approval
//
// Kicks off (or restarts) the chain. Pulls the production's chain via
// productionApprover, calls advanceChain to materialize the first
// pending approvalLink for this round, dispatches Meta Cloud WhatsApp,
// and flips production.status='awaiting_approval'.
//
// Allowed source statuses:
//   - script_drafting: round 1 (or whatever the next free round is)
//   - revision_requested: bumps round to max+1, restarts from step 1
//
// Idempotent on the production-pending unique index — calling twice
// returns the existing row without double-dispatching.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: productionId } = await params

  const [prod] = await db
    .select()
    .from(production)
    .where(eq(production.id, productionId))
  if (!prod) return NextResponse.json({ error: "Produção não encontrada" }, { status: 404 })

  const ok = await userHasClientAccess(session.user.id, prod.clientId)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  if (prod.status !== "script_drafting" && prod.status !== "revision_requested") {
    return NextResponse.json(
      { error: `Status atual (${prod.status}) não permite envio. Só de "Em elaboração" ou "Pedido de alteração".` },
      { status: 400 },
    )
  }
  if (!prod.scriptJson) {
    return NextResponse.json({ error: "Roteiro vazio. Escreva antes de enviar." }, { status: 400 })
  }

  // Make sure the chain is configured.
  const chainRows = await db
    .select()
    .from(productionApprover)
    .where(eq(productionApprover.productionId, productionId))
  if (chainRows.length === 0) {
    return NextResponse.json(
      { error: "Configure ao menos um aprovador antes de enviar." },
      { status: 400 },
    )
  }

  // Round: if drafting (first send), use round=1. If revision_requested,
  // bump to max+1 so the partial unique index doesn't collide with the
  // previous round's rows (which carry decision='changes_requested').
  const round = prod.status === "revision_requested" ? await bumpRound(db, productionId) : 1

  // advanceChain handles the actual INSERT (with onConflictDoNothing).
  const result = await advanceChain(db, productionId, round)
  if (result.kind === "no_chain") {
    return NextResponse.json({ error: "Sem chain configurada" }, { status: 400 })
  }
  if (result.kind === "complete") {
    // Edge case: every approver in this round already has an approved row.
    // Rare (shouldn't happen on first send), but if it does we just flip
    // the production to approved and call it.
    await db
      .update(production)
      .set({ status: "approved" satisfies ProductionStatus, updatedAt: new Date() })
      .where(eq(production.id, productionId))
    return NextResponse.json({ ok: true, status: "approved", round, totalSteps: chainRows.length })
  }

  const { approvalLinkRow, approver, stepOrder, totalSteps } = result

  // Dispatch via the agency's Meta Cloud config. One WABA per user — all
  // clients of the same agency share the same WhatsApp number.
  const [c] = await db
    .select({ userId: clientTable.userId })
    .from(clientTable)
    .where(eq(clientTable.id, prod.clientId))

  const approvalUrl = `${APP_URL}/approve/${approvalLinkRow.token}`

  let sentVia: "meta_cloud" | "none" = "none"
  let dispatchReason: string | null = null

  if (c && approver.phone) {
    const config = await getUserWhatsappConfig(c.userId)
    const sendResult = await dispatchApprovalRequest({
      config,
      phone: approver.phone,
      contactName: approver.name,
      postTitle: prod.title,
      approvalUrl,
    })
    if (sendResult.ok) {
      sentVia = "meta_cloud"
    } else {
      dispatchReason = sendResult.reason
    }
  } else if (!approver.phone) {
    dispatchReason = "Aprovador sem telefone"
  } else {
    dispatchReason = "Cliente não encontrado"
  }

  await db
    .update(approvalLink)
    .set({ sentVia, sentAt: sentVia === "none" ? null : new Date() })
    .where(eq(approvalLink.id, approvalLinkRow.id))

  // Flip production status. Atomic on a conditional WHERE so a stale
  // PATCH doesn't blow away a concurrent advance.
  await db
    .update(production)
    .set({ status: "awaiting_approval" satisfies ProductionStatus, updatedAt: new Date() })
    .where(and(eq(production.id, productionId), eq(production.status, prod.status)))

  return NextResponse.json({
    ok: true,
    round,
    stepOrder,
    totalSteps,
    approver: { id: approver.id, name: approver.name, phone: approver.phone },
    sentVia,
    dispatchReason,
    approvalUrl,
  })
}
