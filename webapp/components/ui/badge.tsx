import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive/15 text-destructive",
        outline: "text-foreground",
        success: "border-transparent bg-success/15 text-success",
        warning: "border-transparent bg-warning/15 text-warning",
        info: "border-transparent bg-info/15 text-info",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
      size: {
        // Tamanho default — matches o uso histórico (text-sm, font-semibold).
        default: "px-2.5 py-0.5 text-sm font-semibold",
        // Tamanho compacto — substitui os inline `<span>` com text-[12px]
        // espalhados em /scheduled, /dashboard, pending-details, etc.
        sm: "px-2 py-0.5 text-[12px] font-medium",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
}

export { Badge, badgeVariants }
