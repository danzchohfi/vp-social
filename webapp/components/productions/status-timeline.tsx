"use client"
/**
 * Compact timeline of meaningful timestamps on a production. v1 doesn't
 * have a dedicated production_status_history table (deferred to a future
 * wave), so we synthesize entries from the production row itself —
 * createdAt, recordingDate, deliveryDate, publishDate, plus the current
 * status as the head.
 *
 * Future: when we add productionStatusHistory, swap the synthesized list
 * for a server-fetched array of (status, changedByUserId, changedAt) and
 * keep the rendering identical.
 */

import { StatusPill } from "./status-pill"
import { Calendar, Clock, Video, Send, Truck } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProductionStatus } from "@/lib/productions"

type TimelinePoint = {
  label: string
  date: Date | null
  icon: React.ComponentType<{ className?: string }>
}

export function StatusTimeline({
  status,
  createdAt,
  recordingDate,
  deliveryDate,
  publishDate,
  updatedAt,
}: {
  status: ProductionStatus
  createdAt: Date | string | null
  recordingDate: Date | string | null
  deliveryDate: Date | string | null
  publishDate: Date | string | null
  updatedAt?: Date | string | null
}) {
  const toDate = (v: Date | string | null | undefined) =>
    v ? (typeof v === "string" ? new Date(v) : v) : null

  const points: TimelinePoint[] = [
    { label: "Criada", date: toDate(createdAt), icon: Calendar },
    { label: "Gravação prevista", date: toDate(recordingDate), icon: Video },
    { label: "Entrega prevista", date: toDate(deliveryDate), icon: Truck },
    { label: "Publicação prevista", date: toDate(publishDate), icon: Send },
  ].filter((p) => p.date !== null)

  const lastUpdate = toDate(updatedAt)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Status
        </h3>
        <StatusPill status={status} />
      </div>

      <ol className="relative space-y-3 border-l border-dashed border-border pl-4">
        {points.map((p, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[21px] top-1 flex h-3 w-3 items-center justify-center rounded-full border bg-card">
              <p.icon className="h-2 w-2 text-muted-foreground" />
            </span>
            <p className="text-xs font-medium">{p.label}</p>
            <p className="text-[11px] text-muted-foreground">{formatDate(p.date)}</p>
          </li>
        ))}
        {lastUpdate && (
          <li className="relative">
            <span className="absolute -left-[21px] top-1 flex h-3 w-3 items-center justify-center rounded-full border bg-card">
              <Clock className="h-2 w-2 text-muted-foreground" />
            </span>
            <p className="text-xs font-medium">Última atualização</p>
            <p className="text-[11px] text-muted-foreground">{formatDate(lastUpdate)}</p>
          </li>
        )}
      </ol>
    </div>
  )
}

function formatDate(d: Date | null): string {
  if (!d) return "—"
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
