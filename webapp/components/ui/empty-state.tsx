import { cn } from "@/lib/utils"
import Link from "next/link"

// Friendly empty state for lists with no rows. Replaces ad-hoc
// "Sem dados" text with: icon in a tinted circle + title + body
// copy + optional CTA. Used wherever a page renders a "nothing to
// show" message — activity feed, scheduled list, productions, etc.
type Tone = "neutral" | "success" | "primary" | "warning"
const TONE_STYLES: Record<Tone, { bg: string; iconColor: string }> = {
  neutral: { bg: "bg-muted", iconColor: "text-muted-foreground" },
  success: { bg: "bg-success/10", iconColor: "text-success" },
  primary: { bg: "bg-primary/10", iconColor: "text-primary" },
  warning: { bg: "bg-warning/15", iconColor: "text-warning" },
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: { label: string; href?: string; onClick?: () => void }
  tone?: Tone
  className?: string
}) {
  const styles = TONE_STYLES[tone]
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-10 text-center", className)}>
      {Icon && (
        <div className={cn("flex h-14 w-14 items-center justify-center rounded-full", styles.bg)}>
          <Icon className={cn("h-6 w-6", styles.iconColor)} />
        </div>
      )}
      <div className="max-w-md space-y-1.5">
        <p className="text-base font-semibold">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20"
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  )
}
