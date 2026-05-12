import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { publishLog } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, XCircle, Clock, History } from "lucide-react"
import { parsePublishTarget } from "@/lib/notion"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"

function PlatformBadge({ raw }: { raw: string | null }) {
  if (!raw || raw === "—") return null
  const target = parsePublishTarget(raw)
  const platform = target?.platform ?? raw
  return <StatusBadge variant="platform" value={platform} label={raw} />
}

export default async function HistoryPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session!.user.id

  const logs = await db
    .select()
    .from(publishLog)
    .where(eq(publishLog.userId, userId))
    .orderBy(desc(publishLog.publishedAt))
    .limit(200)

  const published = logs.filter((l) => l.status === "published").length
  const failed = logs.filter((l) => l.status === "failed").length
  const skipped = logs.filter((l) => l.status === "skipped").length

  return (
    <div className="p-8">
      <PageHeader title="Histórico" subtitle="Registro completo de todas as publicações" />

      {/* Summary */}
      <div className="mb-8 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-base">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="font-semibold text-success">{published}</span>
          <span className="text-muted-foreground">publicados</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-base">
          <XCircle className="h-4 w-4 text-destructive" />
          <span className="font-semibold text-destructive">{failed}</span>
          <span className="text-muted-foreground">com erro</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{skipped}</span>
          <span className="text-muted-foreground">ignorados</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Publicações</CardTitle>
          <CardDescription>Últimas {logs.length} entradas</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <EmptyState
              icon={History}
              title="Nenhuma publicação ainda"
              description="O histórico aparecerá aqui assim que o sistema publicar o primeiro post."
            />
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {log.status === "published" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
                      {log.status === "failed" && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                      {log.status === "skipped" && <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0">
                        <p className="text-base font-medium truncate">{log.postTitle || "Post sem título"}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <PlatformBadge raw={log.platform} />
                          <p className="text-sm text-muted-foreground">
                            {log.conta} · {new Date(log.publishedAt).toLocaleString("pt-BR", {
                              day: "2-digit", month: "2-digit", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                              timeZone: "America/Sao_Paulo",
                            })}
                            {log.platformPostId && (
                              <span className="ml-2 font-mono opacity-60">ID: {log.platformPostId}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                    <StatusBadge variant="publish" value={log.status} className="shrink-0" />
                  </div>
                  {log.error && (
                    <p className="mt-2 rounded bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
                      {log.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
