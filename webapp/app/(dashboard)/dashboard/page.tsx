import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { instagramAccount, notionConnection, publishLog } from "@/lib/db/schema"
import { eq, desc, count } from "drizzle-orm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Instagram, BookOpen, CheckCircle2, XCircle, Clock, ArrowRight, Zap } from "lucide-react"
import Link from "next/link"

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session!.user.id

  const [accounts, notion, logs] = await Promise.all([
    db.select().from(instagramAccount).where(eq(instagramAccount.userId, userId)),
    db.select().from(notionConnection).where(eq(notionConnection.userId, userId)),
    db.select().from(publishLog).where(eq(publishLog.userId, userId)).orderBy(desc(publishLog.publishedAt)).limit(10),
  ])

  const notionConnected = notion.length > 0
  const hasAccounts = accounts.length > 0
  const isReady = notionConnected && hasAccounts

  const published = logs.filter((l) => l.status === "published").length
  const failed = logs.filter((l) => l.status === "failed").length

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Olá, {session!.user.name} 👋</p>
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
            <CardDescription>Contas Instagram</CardDescription>
            <CardTitle className="text-3xl">{accounts.filter((a) => a.active).length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{accounts.length} no total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Publicados (histórico)</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">{published}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Últimos 10 registros</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com erro</CardDescription>
            <CardTitle className="text-3xl text-red-500">{failed}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Últimos 10 registros</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>Últimas publicações do sistema</CardDescription>
          </div>
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
                <div key={log.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    {log.status === "published" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                    {log.status === "failed" && <XCircle className="h-5 w-5 text-red-500" />}
                    {log.status === "skipped" && <Clock className="h-5 w-5 text-muted-foreground" />}
                    <div>
                      <p className="text-sm font-medium">{log.postTitle || "Post sem título"}</p>
                      <p className="text-xs text-muted-foreground">{log.conta} · {new Date(log.publishedAt).toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                  <Badge variant={log.status === "published" ? "success" : log.status === "failed" ? "destructive" : "secondary"}>
                    {log.status === "published" ? "Publicado" : log.status === "failed" ? "Erro" : "Ignorado"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
