import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { instagramAccount, notionConnection, publishLog } from "@/lib/db/schema"
import { eq, desc, count } from "drizzle-orm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Instagram, BookOpen, CheckCircle2, XCircle, Clock, Zap, ArrowRight, Facebook, Youtube, Linkedin } from "lucide-react"
import Link from "next/link"
import { PublishButton } from "@/components/dashboard/publish-button"
import { getActiveClient } from "@/lib/active-client"

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session!.user.id

  const activeClient = await getActiveClient(userId)
  const clientId = activeClient.id

  const [accounts, notion, logs, stats] = await Promise.all([
    db.select().from(instagramAccount).where(eq(instagramAccount.clientId, clientId)),
    db.select().from(notionConnection).where(eq(notionConnection.clientId, clientId)),
    db.select().from(publishLog).where(eq(publishLog.clientId, clientId)).orderBy(desc(publishLog.publishedAt)).limit(10),
    db
      .select({ status: publishLog.status, total: count() })
      .from(publishLog)
      .where(eq(publishLog.clientId, clientId))
      .groupBy(publishLog.status),
  ])

  const notionConnected = notion.length > 0
  const notionHasDb = notion.some((n) => n.databaseId)
  const hasAccounts = accounts.filter((a) => a.active).length > 0
  const isReady = notionConnected && notionHasDb && hasAccounts

  if (!notionConnected && !hasAccounts && logs.length === 0 && activeClient.name === "Cliente padrão") {
    redirect("/onboarding")
  }

  const totalPublished = stats.find((s) => s.status === "published")?.total ?? 0
  const totalFailed = stats.find((s) => s.status === "failed")?.total ?? 0

  const PLATFORM_META: Record<string, { label: string; icon: any }> = {
    instagram: { label: "Instagram", icon: Instagram },
    facebook: { label: "Facebook", icon: Facebook },
    youtube: { label: "YouTube", icon: Youtube },
    tiktok: { label: "TikTok", icon: null },
    linkedin: { label: "LinkedIn", icon: Linkedin },
  }
  const PLATFORM_ORDER = ["instagram", "facebook", "youtube", "tiktok", "linkedin"]
  const activeByPlatform = PLATFORM_ORDER.map((p) => ({
    platform: p,
    label: PLATFORM_META[p]?.label ?? p,
    icon: PLATFORM_META[p]?.icon,
    active: accounts.filter((a) => a.platform === p && a.active).length,
    total: accounts.filter((a) => a.platform === p).length,
  })).filter((x) => x.total > 0)

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight sm:text-4xl">Dashboard</h1>
          <p className="text-muted-foreground">
            {activeClient.name} · Olá, {session!.user.name} 👋
          </p>
        </div>
        {isReady && <PublishButton />}
      </div>

      {!isReady && (
        <div className="mb-8 rounded-xl border border-primary/20 border-l-4 border-l-primary bg-gradient-to-br from-primary/5 to-transparent p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Configure este cliente</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete os passos abaixo para começar a publicar para <strong>{activeClient.name}</strong>.
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

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Publicados</CardDescription>
            <CardTitle className="font-[family-name:var(--font-display)] text-4xl font-normal text-success">{totalPublished}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">total deste cliente</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com erro</CardDescription>
            <CardTitle className="font-[family-name:var(--font-display)] text-4xl font-normal text-destructive">{totalFailed}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">total deste cliente</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Contas ativas por plataforma</CardTitle>
              <CardDescription>Onde {activeClient.name} pode publicar</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/accounts">Gerenciar <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activeByPlatform.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              Nenhuma conta conectada a este cliente ainda.{" "}
              <Link href="/accounts" className="underline">Conectar agora</Link>.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeByPlatform.map((p) => {
                const Icon = p.icon
                const isActive = p.active > 0
                return (
                  <div
                    key={p.platform}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${isActive ? "border-success/30 bg-success/5" : "bg-muted/20"}`}
                  >
                    <div className="flex items-center gap-2.5">
                      {Icon ? (
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <div className="h-4 w-4 rounded-sm bg-foreground/70" />
                      )}
                      <span className="text-sm font-medium">{p.label}</span>
                    </div>
                    <span className={isActive ? "text-sm font-semibold text-success" : "text-sm text-muted-foreground"}>
                      {p.active} ativa{p.active === 1 ? "" : "s"}
                      {p.total !== p.active && <span className="ml-1 text-xs text-muted-foreground">/ {p.total}</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>Últimas 10 publicações deste cliente</CardDescription>
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
                Configure as contas e marque posts como &quot;Agendamento&quot; no Notion.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {log.status === "published" && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}
                      {log.status === "failed" && <XCircle className="h-5 w-5 shrink-0 text-destructive" />}
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
