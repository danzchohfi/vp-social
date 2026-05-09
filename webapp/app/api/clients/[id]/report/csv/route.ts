import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client as clientTable, publishLog } from "@/lib/db/schema"
import { and, asc, eq, gte, lt } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userHasClientAccess } from "@/lib/active-client"

// CSV export of the per-client monthly publish log — one row per
// publish attempt. Useful for billing, accounting handover, or when
// the agency wants to paste the data into a spreadsheet for a custom
// report. Companion to /api/clients/[id]/report (which is aggregated).
//
// Locale: pt-BR. Separator is `;` to match Brazilian Excel defaults
// (which interprets `,` as decimal). UTF-8 BOM up front so Excel
// auto-detects encoding.
//
// Query: /api/clients/[id]/report/csv?month=YYYY-MM
//   Defaults to current month if omitted.

function parseMonth(input: string | null): { from: Date; to: Date; label: string } {
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth()
  const m = (input ?? "").match(/^(\d{4})-(\d{2})$/)
  if (m) {
    year = parseInt(m[1], 10)
    month = parseInt(m[2], 10) - 1
  }
  const from = new Date(year, month, 1, 0, 0, 0)
  const to = new Date(year, month + 1, 1, 0, 0, 0)
  const label = `${year}-${String(month + 1).padStart(2, "0")}`
  return { from, to, label }
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  // Quote if the value contains the separator, a quote, or any line
  // terminator. Inside quotes, escape quotes by doubling them.
  if (/[;"\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cliente"
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const ok = await userHasClientAccess(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const url = new URL(req.url)
  const range = parseMonth(url.searchParams.get("month"))

  const [c] = await db.select().from(clientTable).where(eq(clientTable.id, id))
  if (!c) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

  const logs = await db
    .select()
    .from(publishLog)
    .where(and(
      eq(publishLog.clientId, id),
      gte(publishLog.publishedAt, range.from),
      lt(publishLog.publishedAt, range.to),
    ))
    // Chronological — easier to read in a spreadsheet than newest-first.
    .orderBy(asc(publishLog.publishedAt))

  const headerRow = [
    "Data",
    "Hora",
    "Título",
    "Conta",
    "Plataforma",
    "Status",
    "Curtidas",
    "Comentários",
    "Alcance",
    "Salvamentos",
    "Impressões",
    "Link do post",
    "Erro",
  ].map(csvEscape).join(";")

  const rows = logs.map((log) => {
    const d = new Date(log.publishedAt)
    const date = d.toLocaleDateString("pt-BR")
    const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    const status =
      log.status === "published" ? "Publicado"
        : log.status === "failed" ? "Erro"
          : log.status === "skipped" ? "Pulado"
            : log.status
    return [
      date,
      time,
      log.postTitle ?? "",
      log.conta ?? "",
      log.platform ?? "",
      status,
      log.metricsLikes ?? "",
      log.metricsComments ?? "",
      log.metricsReach ?? "",
      log.metricsSaves ?? "",
      log.metricsImpressions ?? "",
      log.platformPostUrl ?? "",
      log.error ?? "",
    ].map(csvEscape).join(";")
  })

  // BOM (﻿) makes Excel pick up UTF-8 instead of mangling
  // accented characters into mojibake.
  const csv = "﻿" + [headerRow, ...rows].join("\r\n") + "\r\n"
  const filename = `relatorio-${slugify(c.name)}-${range.label}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
