import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  instagramAccount,
  notionConnection,
  publishLog,
  userWhatsappConfig,
} from "@/lib/db/schema"
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { listAccessibleClients } from "@/lib/active-client"

// GET /api/health — agregado de saúde de todas integrações da agency.
// Cached-by-default: usa sinais que já temos no DB (publishLog erros 7d,
// instagramAccount.lastRefreshError, presença de userWhatsappConfig).
// SEM live validation aqui — isso fica em /api/health/test/[type]/[id].
//
// Status calc:
//   "error":
//     - lastRefreshError setado E lastRefreshErrorAt < 7d atrás
//     - OU errorRate7d > 0.5 (mais falhas que sucessos nos últimos 7d)
//     - OU sem successAt em 14+ dias E há atividade recente (publishLog rows)
//   "warn":
//     - errorCount7d > 0 (pelo menos 1 falha em 7d) mas errorRate <= 0.5
//     - OU sem successAt em 7-14 dias
//   "ok":
//     - resto
//
// Pra monitoramento externo (uptime checkers): qualquer status 200 indica
// que o app+DB+auth estão respondendo. Payload é informacional pra UI.

type Status = "ok" | "warn" | "error"

type NotionRow = {
  id: string
  workspaceName: string
  clientId: string | null
  clientName: string | null
  status: Status
  statusMessage: string
  lastSuccessAt: Date | null
  errorCount7d: number
  publishCount7d: number
}

type SocialRow = {
  id: string
  platform: string
  accountName: string
  clientId: string | null
  clientName: string | null
  status: Status
  statusMessage: string
  lastRefreshError: string | null
  lastRefreshErrorAt: Date | null
  lastSuccessAt: Date | null
  errorCount7d: number
  publishCount7d: number
}

type WhatsappBlock = {
  configured: boolean
  status: Status | "not_configured"
  statusMessage: string
  phoneNumberId: string | null
  templateName: string | null
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

function computeStatus(args: {
  errorCount7d: number
  publishCount7d: number
  lastSuccessAt: Date | null
  lastRefreshError: string | null
  lastRefreshErrorAt: Date | null
  now: number
}): { status: Status; message: string } {
  const { errorCount7d, publishCount7d, lastSuccessAt, lastRefreshError, lastRefreshErrorAt, now } = args
  const successCount7d = publishCount7d - errorCount7d
  const errorRate = publishCount7d > 0 ? errorCount7d / publishCount7d : 0

  if (lastRefreshError && lastRefreshErrorAt && now - lastRefreshErrorAt.getTime() < SEVEN_DAYS_MS) {
    return { status: "error", message: `Reconectar: ${lastRefreshError.slice(0, 80)}` }
  }

  if (errorRate > 0.5 && errorCount7d >= 2) {
    return { status: "error", message: `${errorCount7d}/${publishCount7d} falhas em 7d` }
  }

  if (lastSuccessAt) {
    const sinceMs = now - lastSuccessAt.getTime()
    if (sinceMs > FOURTEEN_DAYS_MS && publishCount7d > 0) {
      return { status: "error", message: `Sem sucesso há mais de 14 dias` }
    }
    if (sinceMs > SEVEN_DAYS_MS) {
      return { status: "warn", message: `Sem sucesso há ${Math.floor(sinceMs / (24 * 60 * 60 * 1000))} dias` }
    }
  }

  if (errorCount7d > 0) {
    return { status: "warn", message: `${errorCount7d} falha(s) em 7d` }
  }

  if (successCount7d > 0) {
    return { status: "ok", message: `${successCount7d} publicação(ões) em 7d` }
  }

  return { status: "ok", message: "Sem atividade recente" }
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const now = Date.now()
  const sevenDaysAgo = new Date(now - SEVEN_DAYS_MS)

  const accessibleClients = await listAccessibleClients(userId)
  const clientNameById = new Map(accessibleClients.map((c) => [c.id, c.name]))
  const clientIds = accessibleClients.map((c) => c.id)

  if (clientIds.length === 0) {
    return NextResponse.json({
      notion: [],
      social: [],
      whatsapp: { configured: false, status: "not_configured", statusMessage: "Sem cliente ativo", phoneNumberId: null, templateName: null },
      quickStats: { ok: 0, warn: 0, error: 0, total: 0 },
    })
  }

  const [notionConns, socialAccounts, waConfig, publishStats] = await Promise.all([
    db.select().from(notionConnection).where(inArray(notionConnection.clientId, clientIds)),
    db.select().from(instagramAccount).where(and(
      inArray(instagramAccount.clientId, clientIds),
      eq(instagramAccount.active, true),
    )),
    db.select().from(userWhatsappConfig).where(eq(userWhatsappConfig.userId, userId)),
    db.select({
      clientId: publishLog.clientId,
      platform: publishLog.platform,
      connectionId: publishLog.connectionId,
      status: publishLog.status,
      publishedAt: publishLog.publishedAt,
    }).from(publishLog).where(and(
      inArray(publishLog.clientId, clientIds),
      gte(publishLog.publishedAt, sevenDaysAgo),
      isNotNull(publishLog.clientId),
    )),
  ])

  // Agrega publishStats em 2 mapas: por (client, platform) pra contas
  // sociais, e por connectionId pra Notion (publishLog tem connectionId
  // pra publicações Notion-originadas).
  type Bucket = { total: number; failed: number; lastSuccess: Date | null }
  const byClientPlatform = new Map<string, Bucket>()
  const byConnection = new Map<string, Bucket>()
  for (const log of publishStats) {
    if (!log.clientId) continue
    const platformKey = `${log.clientId}::${(log.platform ?? "").toLowerCase()}`
    const bucket = byClientPlatform.get(platformKey) ?? { total: 0, failed: 0, lastSuccess: null }
    bucket.total += 1
    if (log.status === "failed") bucket.failed += 1
    if (log.status === "published" && (!bucket.lastSuccess || log.publishedAt > bucket.lastSuccess)) {
      bucket.lastSuccess = log.publishedAt
    }
    byClientPlatform.set(platformKey, bucket)

    if (log.connectionId) {
      const conn = byConnection.get(log.connectionId) ?? { total: 0, failed: 0, lastSuccess: null }
      conn.total += 1
      if (log.status === "failed") conn.failed += 1
      if (log.status === "published" && (!conn.lastSuccess || log.publishedAt > conn.lastSuccess)) {
        conn.lastSuccess = log.publishedAt
      }
      byConnection.set(log.connectionId, conn)
    }
  }

  const notionRowsOut: NotionRow[] = notionConns.map((conn) => {
    const bucket = byConnection.get(conn.id) ?? { total: 0, failed: 0, lastSuccess: null }
    const { status, message } = computeStatus({
      errorCount7d: bucket.failed,
      publishCount7d: bucket.total,
      lastSuccessAt: bucket.lastSuccess,
      lastRefreshError: null,
      lastRefreshErrorAt: null,
      now,
    })
    return {
      id: conn.id,
      workspaceName: conn.workspaceName,
      clientId: conn.clientId,
      clientName: conn.clientId ? clientNameById.get(conn.clientId) ?? null : null,
      status,
      statusMessage: message,
      lastSuccessAt: bucket.lastSuccess,
      errorCount7d: bucket.failed,
      publishCount7d: bucket.total,
    }
  })

  const socialRowsOut: SocialRow[] = socialAccounts.map((acc) => {
    const platformKey = `${acc.clientId}::${acc.platform.toLowerCase()}`
    const bucket = byClientPlatform.get(platformKey) ?? { total: 0, failed: 0, lastSuccess: null }
    const { status, message } = computeStatus({
      errorCount7d: bucket.failed,
      publishCount7d: bucket.total,
      lastSuccessAt: bucket.lastSuccess,
      lastRefreshError: acc.lastRefreshError ?? null,
      lastRefreshErrorAt: acc.lastRefreshErrorAt ?? null,
      now,
    })
    return {
      id: acc.id,
      platform: acc.platform,
      accountName: acc.pageName || acc.conta || acc.pageId,
      clientId: acc.clientId,
      clientName: acc.clientId ? clientNameById.get(acc.clientId) ?? null : null,
      status,
      statusMessage: message,
      lastRefreshError: acc.lastRefreshError ?? null,
      lastRefreshErrorAt: acc.lastRefreshErrorAt ?? null,
      lastSuccessAt: bucket.lastSuccess,
      errorCount7d: bucket.failed,
      publishCount7d: bucket.total,
    }
  })

  const cfg = waConfig[0]
  const isConfigured = !!cfg?.metaWaToken && !!cfg?.metaPhoneNumberId && !!cfg?.metaTemplateName
  const whatsapp: WhatsappBlock = isConfigured
    ? {
        configured: true,
        status: "ok",
        statusMessage: "Configurado (validar com botão Testar)",
        phoneNumberId: cfg.metaPhoneNumberId,
        templateName: cfg.metaTemplateName,
      }
    : {
        configured: false,
        status: "not_configured",
        statusMessage: cfg
          ? "Faltando token, phone_number_id ou template"
          : "Sem configuração",
        phoneNumberId: cfg?.metaPhoneNumberId ?? null,
        templateName: cfg?.metaTemplateName ?? null,
      }

  const allRows: Array<{ status: Status | "not_configured" }> = [
    ...notionRowsOut.map((r) => ({ status: r.status })),
    ...socialRowsOut.map((r) => ({ status: r.status })),
    { status: whatsapp.status },
  ]
  const quickStats = {
    ok: allRows.filter((r) => r.status === "ok").length,
    warn: allRows.filter((r) => r.status === "warn").length,
    error: allRows.filter((r) => r.status === "error").length,
    total: allRows.length,
  }

  return NextResponse.json({
    notion: notionRowsOut,
    social: socialRowsOut,
    whatsapp,
    quickStats,
  })
}
