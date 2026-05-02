import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { publishLog } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Clock, History } from "lucide-react"

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
        <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Histórico</h1>
        <p className="text-muted-foreground">Registro completo de todas as publicações</p>
      </div>

      {/* Summary */}
      <div className="mb-8 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="font-semibold text-success">{published}</span>
          <span className="text-muted-foreground">publicados</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
          <XCircle className="h-4 w-4 text-destructive" />
          <span className="font-semibold text-destructive">{failed}</span>
          <span className="text-muted-foreground">com erro</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
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
              <p className="mt-1 text-sm text-muted-foreground">
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
                        <p className="text-sm font-medium truncate">{log.postTitle || "Post sem título"}</p>
                        <p className="text-xs text-muted-foreground">
                          {log.conta} · {new Date(log.publishedAt).toLocaleString("pt-BR", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                          {log.instagramPostId && (
                            <span className="ml-2 font-mono opacity-60">ID: {log.instagramPostId}</span>
                          )}
                        </p>
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
                    <p className="mt-2 rounded bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
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
