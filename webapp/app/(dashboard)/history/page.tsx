import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { publishLog } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Clock, History } from "lucide-react"
import { parsePublishTarget } from "@/lib/notion"
import { cn } from "@/lib/utils"

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  facebook: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  youtube: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  tiktok: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  linkedin: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
}

function PlatformBadge({ raw }: { raw: string | null }) {
  if (!raw || raw === "—") return null
  const target = parsePublishTarget(raw)
  const platform = target?.platform ?? raw.toLowerCase().split(/[\s-]+/)[0]
  const colorClass = PLATFORM_COLORS[platform] ?? "bg-muted text-muted-foreground"
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-sm font-medium", colorClass)}>
      {raw}
    </span>
  )
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
      <div className="mb-8">
        <h1 className="text-3xl tracking-tight sm:text-4xl">Histórico</h1>
        <p className="text-muted-foreground">Registro completo de todas as publicações</p>
      </div>

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
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <History className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium">Nenhuma publicação ainda</p>
              <p className="mt-1 text-base text-muted-foreground">
                O histórico aparecerá aqui assim que o sistema publicar o primeiro post.
              </p>
            </div>
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
                    <Badge
                      className="shrink-0"
                      variant={
                        log.status === "published"
                          ? "success"
                          : log.status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {log.status === "published"
                        ? "Publicado"
                        : log.status === "failed"
                        ? "Erro"
                        : "Ignorado"}
                    </Badge>
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
