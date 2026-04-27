import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { instagramAccount, notionConnection, publishLog } from "@/lib/db/schema"
import { eq, desc, count, and, sql } from "drizzle-orm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Instagram, BookOpen, CheckCircle2, XCircle, Clock, Zap, ArrowRight } from "lucide-react"
import Link from "next/link"
import { PublishButton } from "@/components/dashboard/publish-button"

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session!.user.id

  const [accounts, notion, logs, stats] = await Promise.all([
    db.select().from(instagramAccount).where(eq(instagramAccount.userId, userId)),
    db.select().from(notionConnection).where(eq(notionConnection.userId, userId)),
    db.select().from(publishLog).where(eq(publishLog.userId, userId)).orderBy(desc(publishLog.publishedAt)).limit(10),
    db
      .select({
        status: publishLog.status,
        total: count(),
      })
      .from(publishLog)
      .where(eq(publishLog.userId, userId))
      .groupBy(publishLog.status),
  ])

  const notionConnected = notion.length > 0
  const notionHasDb = notion.some((n) => n.databaseId)
  const hasAccounts = accounts.filter((a) => a.active).length > 0
  const isReady = notionConnected && notionHasDb && hasAccounts

  const totalPublished = stats.find((s) => s.status === "published")?.total ?? 0
  const totalFailed = stats.find((s) => s.status === "failed")?.total ?? 0

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Olá, {session!.user.name} 👋</p>
        </div>
        {isReady && <PublishButton />}
      </div>

      {/* Setup banner */}
      {!isReady && (
        <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Configure sua conta</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete os passos abaixo para começar a publicar automaticamente.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {!notionConnected && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/settings">
                      <BookOpen className="h-4 w-4" /> Conectar Notion
                    </Link>
                  </Button>
                )}
                {notionConnected && !notionHasDb && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/settings">
                      <BookOpen className="h-4 w-4" /> Selecionar banco de dados
                    </Link>
                  </Button>
                )}
                {!hasAccounts && (
                  <Button size="sm" asChild>
                    <Link href="/accounts">
                      <Instagram className="h-4 w-4" /> Conectar Instagram
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Contas ativas</CardDescription>
            <CardTitle className="text-3xl">{accounts.filter((a) => a.active).length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{accounts.length} conectada{accounts.length !== 1 ? "s" : ""} no total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Publicados</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">{totalPublished}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">total histórico</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com erro</CardDescription>
            <CardTitle className="text-3xl text-red-500">{totalFailed}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">total histórico</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>Últimas 10 publicações do sistema</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/history">Ver tudo <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium">Nenhuma publicação ainda</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Configure as contas e marque posts como "Agendamento" no Notion.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {log.status === "published" && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}
                      {log.status === "failed" && <XCircle className="h-5 w-5 shrink-0 text-red-500" />}
                      {log.status === "skipped" && <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{log.postTitle || "Post sem título"}</p>
                        <p className="text-xs text-muted-foreground">{log.conta} · {new Date(log.publishedAt).toLocaleString("pt-BR")}</p>
                      </div>
                    </div>
                    <Badge className="shrink-0 ml-3" variant={log.status === "published" ? "success" : log.status === "failed" ? "destructive" : "secondary"}>
                      {log.status === "published" ? "Publicado" : log.status === "failed" ? "Erro" : "Ignorado"}
                    </Badge>
                  </div>
                  {log.status === "failed" && log.error && (
                    <p className="mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
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
