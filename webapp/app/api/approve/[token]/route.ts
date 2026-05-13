import { db } from "@/lib/db"
import {
  approvalLink,
  client as clientTable,
  fieldMapping,
  notionConnection,
  production,
  productionApprover,
  approver as approverTable,
} from "@/lib/db/schema"
import { and, asc, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm"
import { NextResponse } from "next/server"
import { createNotionClient, DEFAULT_MAPPING, type FieldMapping } from "@/lib/notion"
import {
  getOrCreateClientCalendarToken,
  isApprovalDecision,
  lookupApprovalLink,
} from "@/lib/approval-link"
import { decideApprovalLink } from "@/lib/approval-decide"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://posts.vitaminapublicitaria.com.br"

// Public API for the per-post approval flow. NO AUTH — the URL token IS
// the auth. The token is created by the cron sweep in trigger/publish.ts
// (kind='post') OR by /api/productions/[id]/send-approval (kind='production_script')
// and delivered via Meta Cloud WhatsApp to the contact's phone. Single-use,
// expires in 14d, and points to one Notion page OR one production-script
// chain step.
//
//   GET  /api/approve/{token}   → returns post|script + client info for the page
//   POST /api/approve/{token}   → records decision, flips Notion status OR
//                                 advances the production chain, posts a
//                                 comment if "changes_requested"
//
// Once a decision is recorded, the same token can't be re-decided. The
// page handles "already decided" + "expired" with their own UX.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const result = await lookupApprovalLink(token)

  if (result.kind === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const row = result.row

  // Pull client + mapping + connection in one shot (we need access token
  // for Notion, plus client name and calendar token for the redirect).
  const [client] = await db
    .select({
      id: clientTable.id,
      name: clientTable.name,
      logoUrl: clientTable.logoUrl,
      publicCalendarToken: clientTable.publicCalendarToken,
    })
    .from(clientTable)
    .where(eq(clientTable.id, row.clientId))

  if (!client) {
    return NextResponse.json({ error: "client_or_connection_gone" }, { status: 410 })
  }

  // Generate (or reuse) the client's permanent calendar token so the
  // page can redirect to /c/{token} after a decision.
  const calendarToken = await getOrCreateClientCalendarToken(client.id)

  // ─── Production-script branch (kind='production_script') ───────────
  // No Notion call — script body lives in DB. Chain context (this is step
  // 2 of 3, João already approved) drives the sidebar banner on the page.
  if (row.kind === "production_script" && row.productionId) {
    const [prod] = await db
      .select()
      .from(production)
      .where(eq(production.id, row.productionId))

    const chainRows = await db
      .select({ stepOrder: productionApprover.stepOrder, approverId: productionApprover.approverId })
      .from(productionApprover)
      .where(eq(productionApprover.productionId, row.productionId))
      .orderBy(asc(productionApprover.stepOrder))

    const myStep = chainRows.find((s) => s.approverId === row.approverId)?.stepOrder ?? 1

    // Approvers who decided in THIS round (so the page can render
    // "João Silva já aprovou ✓" hints).
    const decidedThisRound = await db
      .select({
        approverId: approvalLink.approverId,
        decidedAt: approvalLink.decidedAt,
        decision: approvalLink.decision,
      })
      .from(approvalLink)
      .where(and(
        eq(approvalLink.kind, "production_script"),
        eq(approvalLink.productionId, row.productionId),
        eq(approvalLink.round, row.round),
      ))

    const allApproverIds = chainRows.map((c) => c.approverId)
    const approvers = allApproverIds.length > 0
      ? await db
          .select({ id: approverTable.id, name: approverTable.name })
          .from(approverTable)
          .where(inArray(approverTable.id, allApproverIds))
      : []
    const nameById = new Map(approvers.map((a) => [a.id, a.name]))

    const previousApprovers = decidedThisRound
      .filter((d) => d.decision === "approved" && d.approverId && d.approverId !== row.approverId)
      .map((d) => ({
        name: d.approverId ? nameById.get(d.approverId) ?? "" : "",
        approvedAt: d.decidedAt,
      }))
      .filter((d) => d.name)

    return NextResponse.json({
      state: result.kind,
      decision: row.decision,
      decidedAt: row.decidedAt,
      sentAt: row.sentAt,
      sentVia: row.sentVia,
      expiresAt: row.expiresAt,
      tacit: row.tacit,
      contactName: row.contactName,
      pendingSiblings: 0,
      kind: "production_script",
      client: {
        name: client.name,
        logoUrl: client.logoUrl,
        calendarUrl: `/c/${calendarToken}`,
      },
      production: prod
        ? {
            id: prod.id,
            title: prod.title,
            type: prod.type,
            specialistName: prod.specialistName,
            scriptJson: prod.scriptJson,
          }
        : null,
      chainContext: {
        stepOrder: myStep,
        totalSteps: chainRows.length,
        round: row.round,
        previousApprovers,
      },
    })
  }

  // ─── Legacy post-approval branch (kind='post') ──────────────────
  const [conn] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.id, row.connectionId))
  if (!conn) return NextResponse.json({ error: "client_or_connection_gone" }, { status: 410 })

  const [mappingRow] = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, conn.id))
  const mapping: FieldMapping = mappingRow ?? DEFAULT_MAPPING

  // Lazily fetch the post details from Notion. Read-only. If the Notion
  // page was deleted, we still want to render an "expired" state instead
  // of a hard 500.
  const notion = createNotionClient(conn.accessToken)
  let post: Awaited<ReturnType<ReturnType<typeof createNotionClient>["getPostById"]>> = null
  try {
    post = await notion.getPostById(row.notionPageId, mapping)
  } catch {
    post = null
  }

  // Count other pending approvals for this same client — drives the
  // sibling banner ("Você tem 2 outros posts pendentes"). Excludes the
  // current token + any decided/expired rows. Cheap query (per-client
  // approval_link table stays small) and uses approval_link_client_idx.
  const now = new Date()
  const siblings = await db
    .select({ id: approvalLink.id })
    .from(approvalLink)
    .where(and(
      eq(approvalLink.clientId, client.id),
      isNull(approvalLink.decision),
      gt(approvalLink.expiresAt, now),
      ne(approvalLink.token, token),
    ))

  return NextResponse.json({
    state: result.kind,
    decision: row.decision,
    decidedAt: row.decidedAt,
    sentAt: row.sentAt,
    sentVia: row.sentVia,
    expiresAt: row.expiresAt,
    tacit: row.tacit,
    contactName: row.contactName,
    pendingSiblings: siblings.length,
    kind: "post",
    client: {
      name: client.name,
      logoUrl: client.logoUrl,
      calendarUrl: `/c/${calendarToken}`,
    },
    post: post
      ? {
          pageId: post.pageId,
          title: post.title,
          conta: post.conta,
          fullCaption: post.fullCaption,
          feedImageUrls: post.feedImageUrls,
          verticalUrls: post.verticalUrls,
          horizontalUrls: post.horizontalUrls,
          thumbnailUrl: post.thumbnailUrl,
          publishTargets: post.publishTargets,
          scheduledDate: post.scheduledDate,
          notionUrl: post.notionUrl,
        }
      : null,
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  if (!isApprovalDecision(body.decision)) {
    return NextResponse.json({ error: "invalid_decision" }, { status: 400 })
  }
  const comment = typeof body.comment === "string" ? body.comment.trim() : ""
  if (body.decision === "changes_requested" && !comment) {
    return NextResponse.json({ error: "comment_required_for_changes" }, { status: 400 })
  }

  // Lookup row (sem revalidação de expiry — atomic UPDATE em decideApprovalLink
  // resolve race entre client e o cron tacit).
  const [row] = await db
    .select()
    .from(approvalLink)
    .where(eq(approvalLink.token, token))

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (row.decision !== null) {
    return NextResponse.json({ error: "already_decided", decision: row.decision }, { status: 409 })
  }

  // Pre-check pra production_script revisão: se mapping não tem
  // revisionRequestedValue, falha já — decideApprovalLink falharia
  // silenciosamente no Notion. Caller espera 500 com configError.
  if (row.kind === "post" && body.decision === "changes_requested") {
    const [mappingRow] = await db
      .select()
      .from(fieldMapping)
      .where(eq(fieldMapping.connectionId, row.connectionId))
    if (!mappingRow?.revisionRequestedValue) {
      return NextResponse.json(
        { error: "revisionRequestedValue not configured", configError: true },
        { status: 500 }
      )
    }
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? null

  const result = await decideApprovalLink({
    row,
    decision: body.decision,
    mode: "explicit",
    comment: comment || null,
    ip,
  })

  if (!result.ok) {
    if (result.reason === "already_decided") {
      return NextResponse.json(
        { error: "already_decided", decision: result.existing },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: result.reason }, { status: 500 })
  }

  const calendarToken = await getOrCreateClientCalendarToken(row.clientId)
  return NextResponse.json({
    ok: true,
    decision: body.decision,
    kind: row.kind,
    calendarUrl: `/c/${calendarToken}`,
  })
}
