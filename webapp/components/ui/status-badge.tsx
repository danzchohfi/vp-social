import { cn } from "@/lib/utils"
import { CheckCircle2, XCircle, Clock, AlertTriangle, Send } from "lucide-react"

// Unified pill for all status-like values. Three variants:
//   - "publish"  : publish_log.status — published / failed / skipped / pending
//   - "approval" : approval lifecycle — pending / approved / rejected / expired
//   - "platform" : platform name with platform-specific color (legacy
//                  PLATFORM_COLORS from /history was reinvented in 3 pages).
//
// Falls back to a neutral muted badge for unknown values so adding a new
// status to `lib/productions.ts` doesn't crash the UI before the lookup
// table is updated.
type PublishStatus = "published" | "failed" | "skipped" | "pending"
type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "tacit"

const PUBLISH_STYLES: Record<PublishStatus, { bg: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  published: { bg: "bg-success/15 text-success", icon: CheckCircle2, label: "Publicado" },
  failed: { bg: "bg-destructive/15 text-destructive", icon: XCircle, label: "Erro" },
  skipped: { bg: "bg-muted text-muted-foreground", icon: Clock, label: "Ignorado" },
  pending: { bg: "bg-info/15 text-info", icon: Send, label: "Em curso" },
}

const APPROVAL_STYLES: Record<ApprovalStatus, { bg: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  pending: { bg: "bg-warning/15 text-warning", icon: Clock, label: "Aguardando" },
  approved: { bg: "bg-success/15 text-success", icon: CheckCircle2, label: "Aprovado" },
  rejected: { bg: "bg-destructive/15 text-destructive", icon: XCircle, label: "Rejeitado" },
  // 'expired' agora cobre só orphan/cancelado (Notion saiu do "aguardando").
  // Tom muted pra não competir visualmente com aprovação tácita ou rejeição real.
  expired: { bg: "bg-muted text-muted-foreground", icon: AlertTriangle, label: "Cancelado" },
  // 'tacit' = aprovado automaticamente após 30 dias de silêncio (sentVia=meta_cloud).
  // Tom amber/warning pra distinguir de aprovação explícita (verde).
  tacit: { bg: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200", icon: Clock, label: "Aprovação tácita" },
}

// Platform colors — extracted from /history's PLATFORM_COLORS so all
// pages can share. "aprovação" is a marker for approval-dispatch failures
// surfaced into publish_log (see trigger/publish.ts).
const PLATFORM_STYLES: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  facebook: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  youtube: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  tiktok: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  linkedin: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  "aprovação": "bg-warning/15 text-warning",
  notion: "bg-foreground/10 text-foreground",
}

export function StatusBadge({
  variant,
  value,
  label,
  className,
}: {
  variant: "publish" | "approval" | "platform"
  value: string
  label?: string
  className?: string
}) {
  if (variant === "publish") {
    const cfg = PUBLISH_STYLES[value as PublishStatus]
    if (!cfg) return <span className={cn("inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground", className)}>{label ?? value}</span>
    const Icon = cfg.icon
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium", cfg.bg, className)}>
        <Icon className="h-3 w-3 shrink-0" />
        {label ?? cfg.label}
      </span>
    )
  }
  if (variant === "approval") {
    const cfg = APPROVAL_STYLES[value as ApprovalStatus]
    if (!cfg) return <span className={cn("inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground", className)}>{label ?? value}</span>
    const Icon = cfg.icon
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium", cfg.bg, className)}>
        <Icon className="h-3 w-3 shrink-0" />
        {label ?? cfg.label}
      </span>
    )
  }
  // platform
  const key = value.toLowerCase().split(/[\s-]+/)[0]
  const bg = PLATFORM_STYLES[key] ?? "bg-muted text-muted-foreground"
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-sm font-medium", bg, className)}>
      {label ?? value}
    </span>
  )
}
