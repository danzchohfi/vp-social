import { PageHeader } from "@/components/ui/page-header"
import { PostRowSkeleton } from "@/components/ui/skeleton"

export default function ScheduledLoading() {
  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="Publicações" subtitle="Carregando…" />
      <PostRowSkeleton count={6} />
    </div>
  )
}
