import { cn } from "@/lib/utils"
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"

// Inline notification box: tone-colored border + background + icon +
// title + body + optional CTA. Replaces the 3-4 ad-hoc variations of
// `<div className="rounded border bg-warning/10 px-3 py-1.5">` etc.
// scattered across pages. Tone-driven, consistent padding, icon picked
// from tone unless overridden.
type Tone = "info" | "warning" | "destructive" | "success"

const TONE_STYLES: Record<Tone, { container: string; icon: string; title: string }> = {
  info: {
    container: "border-info/30 bg-info/10",
    icon: "text-info",
    title: "text-info",
  },
  warning: {
    container: "border-warning/40 bg-warning/10",
    icon: "text-warning",
    title: "text-warning",
  },
  destructive: {
    container: "border-destructive/30 bg-destructive/10",
    icon: "text-destructive",
    title: "text-destructive",
  },
  success: {
    container: "border-success/30 bg-success/10",
    icon: "text-success",
    title: "text-success",
  },
}

const TONE_ICONS: Record<Tone, React.ComponentType<{ className?: string }>> = {
  info: Info,
  warning: AlertTriangle,
  destructive: XCircle,
  success: CheckCircle2,
}

export function InlineAlert({
  tone = "info",
  title,
  children,
  icon: IconOverride,
  action,
  className,
}: {
  tone?: Tone
  title?: React.ReactNode
  children?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  className?: string
}) {
  const styles = TONE_STYLES[tone]
  const Icon = IconOverride ?? TONE_ICONS[tone]
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        styles.container,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", styles.icon)} />
      <div className="min-w-0 flex-1">
        {title && <p className={cn("font-medium", styles.title)}>{title}</p>}
        {children && <div className={cn("text-foreground/80", title && "mt-1")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
