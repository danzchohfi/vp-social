import * as React from "react"
import { cn } from "@/lib/utils"

// `variant="glass"` opt-in pra cards que se beneficiam de profundidade
// (hero cards em landing/public portals, futuros modais). Default fica
// idêntico — zero impacto em call sites existentes.
type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "glass"
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl text-card-foreground",
        variant === "glass"
          ? "glass shadow-lg"
          : "border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"

// p-[var(--card-padding)] respeita o toggle global de densidade
// (data-density="compact|comfortable" no <html>). Default 1.5rem (current
// p-6 equiv) em comfortable, 1rem em compact. Tailwind v4 aceita arbitrary
// value referenciando CSS var nativamente.
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-[var(--card-padding)]", className)} {...props} />
  )
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
  )
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-base text-muted-foreground", className)} {...props} />
  )
)
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("px-[var(--card-padding)] pb-[var(--card-padding)] pt-0", className)} {...props} />
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center px-[var(--card-padding)] pb-[var(--card-padding)] pt-0", className)} {...props} />
  )
)
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
