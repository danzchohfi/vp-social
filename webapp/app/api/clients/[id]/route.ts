import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim()
  if (body.logoUrl !== undefined) update.logoUrl = body.logoUrl
  // Approval routing per client. 'auto' = cron dispatches via Meta Cloud
  // (agency config). 'manual_wame' = skip auto dispatch; agency clicks
  // "Enviar via WA" on /scheduled. NULL = auto default.
  if (body.approvalNotificationMode !== undefined) {
    const v = body.approvalNotificationMode
    if (v !== null && v !== "auto" && v !== "manual_wame") {
      return NextResponse.json({ error: "approvalNotificationMode inválido" }, { status: 400 })
    }
    update.approvalNotificationMode = v
  }
  // Approval dispatch timing: 'auto' (cron fires WA per pending post) or
  // 'manual' (cron creates links silently; agency clicks "Notificar
  // pendentes" on /dashboard). NULL clears = auto default.
  if (body.approvalDispatchMode !== undefined) {
    const v = body.approvalDispatchMode
    if (v !== null && v !== "auto" && v !== "manual") {
      return NextResponse.json({ error: "approvalDispatchMode inválido" }, { status: 400 })
    }
    update.approvalDispatchMode = v
  }
  // Custom wa.me template for manual mode. Empty string clears (back to
  // hardcoded default). We don't validate placeholders — if the user
  // skips one their message just renders without that piece.
  if (body.manualWhatsappTemplate !== undefined) {
    update.manualWhatsappTemplate = typeof body.manualWhatsappTemplate === "string" && body.manualWhatsappTemplate.trim()
      ? body.manualWhatsappTemplate
      : null
  }
  // Pause-publish toggle. When TRUE, the cron skips this client entirely.
  if (body.publishingPaused !== undefined) {
    update.publishingPaused = body.publishingPaused === true
  }
  // Notion `conta` values that belong to this client. Used by
  // /api/notion/scheduled + trigger/publish.ts to route posts to the
  // right tenant without name-matching heuristics. Empty array clears
  // the mapping (back to legacy behavior).
  if (body.notionContaValues !== undefined) {
    if (!Array.isArray(body.notionContaValues)) {
      return NextResponse.json({ error: "notionContaValues deve ser uma lista de strings" }, { status: 400 })
    }
    const cleaned = body.notionContaValues
      .map((v: unknown) => (typeof v === "string" ? v.trim() : ""))
      .filter((v: string) => v.length > 0)
    update.notionContaValues = cleaned.length > 0 ? cleaned : null
  }
  // URL pro form externo "Solicitar nova produção" exibido no portal.
  // null = botão escondido. Validamos HTTPS only — não queremos botão
  // levando o cliente pra um http:// (vetor de MITM em redes wifi).
  if (body.briefingFormUrl !== undefined) {
    if (body.briefingFormUrl === null || body.briefingFormUrl === "") {
      update.briefingFormUrl = null
    } else if (typeof body.briefingFormUrl !== "string") {
      return NextResponse.json({ error: "briefingFormUrl deve ser string" }, { status: 400 })
    } else {
      const trimmed = body.briefingFormUrl.trim()
      try {
        const u = new URL(trimmed)
        if (u.protocol !== "https:") {
          return NextResponse.json({ error: "briefingFormUrl precisa ser HTTPS" }, { status: 400 })
        }
        update.briefingFormUrl = trimmed
      } catch {
        return NextResponse.json({ error: "briefingFormUrl não é URL válida" }, { status: 400 })
      }
    }
  }
  // Notion page ID do briefing respondido do cliente. Aceita ID puro
  // (32 hex) ou URL completa do Notion — normaliza pra UUID.
  if (body.briefingNotionPageId !== undefined) {
    if (body.briefingNotionPageId === null || body.briefingNotionPageId === "") {
      update.briefingNotionPageId = null
    } else if (typeof body.briefingNotionPageId !== "string") {
      return NextResponse.json({ error: "briefingNotionPageId deve ser string" }, { status: 400 })
    } else {
      const raw = body.briefingNotionPageId.trim()
      const match = raw.match(/([a-f0-9]{32})/i)
      if (!match) {
        return NextResponse.json({ error: "Notion page ID inválido (precisa 32 hex chars)" }, { status: 400 })
      }
      const h = match[1]
      update.briefingNotionPageId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
    }
  }
  // ─── White-label (Pilar 7 do brand doc) ──────────────────────────
  // HEX '#RRGGBB'. Cor é injetada via inline style no portal — validamos
  // formato pra fechar a porta de CSS injection.
  const HEX_RE = /^#[0-9a-fA-F]{6}$/
  if (body.agencyPrimaryColor !== undefined) {
    if (body.agencyPrimaryColor === null || body.agencyPrimaryColor === "") {
      update.agencyPrimaryColor = null
    } else if (typeof body.agencyPrimaryColor !== "string" || !HEX_RE.test(body.agencyPrimaryColor)) {
      return NextResponse.json({ error: "agencyPrimaryColor precisa ser #RRGGBB" }, { status: 400 })
    } else {
      update.agencyPrimaryColor = body.agencyPrimaryColor
    }
  }
  if (body.agencyAccentColor !== undefined) {
    if (body.agencyAccentColor === null || body.agencyAccentColor === "") {
      update.agencyAccentColor = null
    } else if (typeof body.agencyAccentColor !== "string" || !HEX_RE.test(body.agencyAccentColor)) {
      return NextResponse.json({ error: "agencyAccentColor precisa ser #RRGGBB" }, { status: 400 })
    } else {
      update.agencyAccentColor = body.agencyAccentColor
    }
  }
  // Google Font family name. Permitimos letras, espaços, hífens e
  // dígitos — bloqueamos qualquer outro char pra que vire URL safe.
  if (body.agencyFontFamily !== undefined) {
    if (body.agencyFontFamily === null || body.agencyFontFamily === "") {
      update.agencyFontFamily = null
    } else if (typeof body.agencyFontFamily !== "string" || !/^[A-Za-z][A-Za-z0-9 -]{0,48}$/.test(body.agencyFontFamily.trim())) {
      return NextResponse.json({ error: "agencyFontFamily inválido (letras, espaços, hífens)" }, { status: 400 })
    } else {
      update.agencyFontFamily = body.agencyFontFamily.trim()
    }
  }
  // ─── Próxima reunião (Pilar 7.4) ─────────────────────────────────
  if (body.nextMeetingAt !== undefined) {
    if (body.nextMeetingAt === null || body.nextMeetingAt === "") {
      update.nextMeetingAt = null
    } else if (typeof body.nextMeetingAt !== "string") {
      return NextResponse.json({ error: "nextMeetingAt deve ser string ISO" }, { status: 400 })
    } else {
      const d = new Date(body.nextMeetingAt)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "nextMeetingAt não é data válida" }, { status: 400 })
      }
      update.nextMeetingAt = d
    }
  }
  if (body.nextMeetingUrl !== undefined) {
    if (body.nextMeetingUrl === null || body.nextMeetingUrl === "") {
      update.nextMeetingUrl = null
    } else if (typeof body.nextMeetingUrl !== "string") {
      return NextResponse.json({ error: "nextMeetingUrl deve ser string" }, { status: 400 })
    } else {
      try {
        const u = new URL(body.nextMeetingUrl.trim())
        if (u.protocol !== "https:") {
          return NextResponse.json({ error: "nextMeetingUrl precisa ser HTTPS" }, { status: 400 })
        }
        update.nextMeetingUrl = u.toString()
      } catch {
        return NextResponse.json({ error: "nextMeetingUrl não é URL válida" }, { status: 400 })
      }
    }
  }
  if (body.nextMeetingNotes !== undefined) {
    if (body.nextMeetingNotes === null || body.nextMeetingNotes === "") {
      update.nextMeetingNotes = null
    } else if (typeof body.nextMeetingNotes !== "string") {
      return NextResponse.json({ error: "nextMeetingNotes deve ser string" }, { status: 400 })
    } else {
      const trimmed = body.nextMeetingNotes.trim().slice(0, 500)
      update.nextMeetingNotes = trimmed || null
    }
  }

  await db
    .update(client)
    .set(update)
    .where(and(eq(client.id, id), eq(client.userId, session.user.id)))

  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const all = await db.select().from(client).where(eq(client.userId, session.user.id))
  if (all.length <= 1) {
    return NextResponse.json(
      { error: "Você precisa manter pelo menos um cliente." },
      { status: 400 }
    )
  }

  await db
    .delete(client)
    .where(and(eq(client.id, id), eq(client.userId, session.user.id)))

  return NextResponse.json({ ok: true })
}
