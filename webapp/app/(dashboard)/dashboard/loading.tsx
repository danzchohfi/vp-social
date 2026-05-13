import { PageHeader } from "@/components/ui/page-header"
import { PostRowSkeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="Dashboard" subtitle="Carregando…" />
      <PostRowSkeleton count={4} />
    </div>
  )
}
