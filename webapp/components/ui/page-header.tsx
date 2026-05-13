import { cn } from "@/lib/utils"

// Top-of-page heading + optional subtitle + action slot. Replaces the
// hand-rolled `<h1 className="text-3xl tracking-tight sm:text-4xl">` +
// `<p className="text-muted-foreground">` pair that every dashboard page
// repeated. Keeps spacing below the header consistent (mb-8) — pages
// don't need to remember it.
export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-3xl tracking-tight sm:text-4xl [view-transition-name:page-title]">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-base text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
