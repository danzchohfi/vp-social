import { cn } from "@/lib/utils"

// Animated skeleton placeholder for loading states. Replaces the
// generic <Loader2 spin /> centered in a void with content-shaped
// blocks — the page reads as "almost there" instead of "stuck".
//
// Usage:
//   <Skeleton className="h-4 w-24" />     // text line
//   <Skeleton className="h-9 w-9 rounded-full" />  // avatar
//   <PostRowSkeleton />                    // pre-shaped row
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/60",
        className,
      )}
      aria-hidden="true"
    />
  )
}

// Card-shaped skeleton that mimics a /scheduled or /clients row.
// Renders N copies in a vertical stack.
export function PostRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3.5 w-1/2" />
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-12" />
              </div>
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
