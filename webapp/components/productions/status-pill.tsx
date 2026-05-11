import { cn } from "@/lib/utils"
import { STATUS_LABEL_PT, type ProductionStatus } from "@/lib/productions"
import {
  PencilLine,
  FileText,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  Video,
  Scissors,
  Truck,
  Send,
  Archive,
} from "lucide-react"

const ICONS: Record<ProductionStatus, React.ComponentType<{ className?: string }>> = {
  brief_pending: FileText,
  script_drafting: PencilLine,
  awaiting_approval: MessageCircle,
  revision_requested: AlertTriangle,
  approved: CheckCircle2,
  recording: Video,
  editing: Scissors,
  delivered: Truck,
  published: Send,
  archived: Archive,
}

const TONES: Record<ProductionStatus, string> = {
  brief_pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  script_drafting: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  awaiting_approval: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  revision_requested: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  recording: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-200",
  editing: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-200",
  delivered: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200",
  published: "bg-success/15 text-success",
  archived: "bg-muted text-muted-foreground",
}

export function StatusPill({ status, className }: { status: ProductionStatus; className?: string }) {
  const Icon = ICONS[status] ?? FileText
  const label = STATUS_LABEL_PT[status] ?? status
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium",
        TONES[status] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </span>
  )
}
