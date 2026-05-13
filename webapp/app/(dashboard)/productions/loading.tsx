import { PageHeader } from "@/components/ui/page-header"
import { PostRowSkeleton } from "@/components/ui/skeleton"

export default function ProductionsLoading() {
  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="Produções" subtitle="Carregando…" />
      <PostRowSkeleton count={5} />
    </div>
  )
}
