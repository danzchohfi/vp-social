"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CalendarClock, Loader2, RefreshCw, Zap, Clock, CheckCircle2, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type TargetCheck = {
  raw: string
  platform: string
  tipo: string
  configured: boolean
  pageName?: string | null
}

type ScheduledPost = {
  pageId: string
  title: string
  conta: string
  scheduledDate: string | null
  workspaceName?: string
  connectionId?: string
  targetChecks?: TargetCheck[]
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  facebook: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  youtube: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  tiktok: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  linkedin: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
}

function platformClass(platform: string) {
  return PLATFORM_COLORS[platform.toLowerCase()] ?? "bg-muted text-muted-foreground"
}

function formatDate(iso: string | null) {
  if (!iso) return "Sem data"
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function timeUntil(iso: string | null): { label: string; isPast: boolean } {
  if (!iso) return { label: "Sem data", isPast: false }
  const diff = new Date(iso).getTime() - Date.now()
  const isPast = diff < 0
  const abs = Math.abs(diff)
  const mins = Math.floor(abs / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return { label: isPast ? `${days}d atrás` : `em ${days}d`, isPast }
  if (hours > 0) return { label: isPast ? `${hours}h atrás` : `em ${hours}h`, isPast }
  return { label: isPast ? `${mins}min atrás` : `em ${mins}min`, isPast }
}

export default function ScheduledPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/notion/scheduled")
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPosts(data.posts ?? [])
      setConfigured(data.configured ?? true)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const now = new Date()

  function postIssues(p: ScheduledPost): string[] {
    const issues: string[] = []
    if (!p.scheduledDate) issues.push('Sem data de publicação')
    const checks = p.targetChecks ?? []
    if (checks.length === 0) issues.push('Campo "Publicar em" vazio')
    else if (checks.every((c) => !c.configured)) issues.push(`Conta "${p.conta || "—"}" não conectada em nenhuma plataforma`)
    return issues
  }

  function willPublish(p: ScheduledPost): boolean {
    return postIssues(p).length === 0
  }

  const willPublishPosts = posts.filter(willPublish)
  const needsAttention = posts.filter((p) => !willPublish(p))
  const readyNow = willPublishPosts.filter((p) => p.scheduledDate && new Date(p.scheduledDate) <= now)
  const upcoming = willPublishPosts.filter((p) => p.scheduledDate && new Date(p.scheduledDate) > now)

  function groupByConta(list: ScheduledPost[]): Array<{ conta: string; posts: ScheduledPost[] }> {
    const map = new Map<string, ScheduledPost[]>()
    for (const p of list) {
      const key = p.conta || "Sem conta"
      const arr = map.get(key) ?? []
      arr.push(p)
      map.set(key, arr)
    }
    return Array.from(map.entries())
      .map(([conta, posts]) => ({ conta, posts }))
      .sort((a, b) => a.conta.localeCompare(b.conta, "pt-BR"))
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight sm:text-4xl">Posts agendados</h1>
          <p className="text-muted-foreground">
            {willPublishPosts.length} prontos para publicar
            {needsAttention.length > 0 && <span className="text-warning"> · {needsAttention.length} precisam de ajustes</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {!configured && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
          <CalendarClock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">Notion não configurado</p>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Configure a conexão com o Notion e selecione o banco de dados primeiro.
          </p>
          <Button asChild size="sm">
            <Link href="/settings">Ir para configurações</Link>
          </Button>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Erro ao buscar posts: {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : configured && !error && posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarClock className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">Nenhum post agendado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Mude o status de um post para "{" "}
              <span className="font-mono">Agendamento</span>" no Notion para ele aparecer aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Ready to publish now */}
          {readyNow.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-success">
                  Prontos para publicar agora ({readyNow.length})
                </h2>
              </div>
              <div className="space-y-6">
                {groupByConta(readyNow).map(({ conta, posts: ps }) => (
                  <ContaGroup key={`ready-${conta}`} conta={conta} posts={ps} canPublishNow onPublished={load} />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Próximas publicações ({upcoming.length})
                </h2>
              </div>
              <div className="space-y-6">
                {groupByConta(upcoming).map(({ conta, posts: ps }) => (
                  <ContaGroup key={`upcoming-${conta}`} conta={conta} posts={ps} />
                ))}
              </div>
            </section>
          )}

          {/* Needs attention */}
          {needsAttention.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-warning">
                  Não vão publicar — precisam de ajustes ({needsAttention.length})
                </h2>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Estes posts estão com status de agendamento mas o sistema não vai publicá-los até resolver os pontos abaixo.
              </p>
              <div className="space-y-6">
                {groupByConta(needsAttention).map(({ conta, posts: ps }) => (
                  <ContaGroup key={`attn-${conta}`} conta={conta} posts={ps} issuesFn={postIssues} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function ContaGroup({ conta, posts, canPublishNow, onPublished, issuesFn }: { conta: string; posts: ScheduledPost[]; canPublishNow?: boolean; onPublished?: () => void; issuesFn?: (p: ScheduledPost) => string[] }) {
  const ws = posts[0]?.workspaceName
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 px-1">
        <h3 className="text-sm font-semibold">{conta}</h3>
        <span className="text-xs text-muted-foreground">
          {posts.length} post{posts.length === 1 ? "" : "s"}
          {ws && <span className="ml-2 opacity-70">· {ws}</span>}
        </span>
      </div>
      <div className="space-y-2">
        {posts.map((post) => (
          <PostRow key={post.pageId} post={post} canPublishNow={canPublishNow} onPublished={onPublished} issues={issuesFn?.(post)} />
        ))}
      </div>
    </div>
  )
}

function TargetBadge({ check }: { check: TargetCheck }) {
  const ok = check.configured
  return (
    <span
      title={ok
        ? `${check.platform} conectada${check.pageName ? ` — ${check.pageName}` : ""}`
        : `Nenhuma conta de ${check.platform} encontrada para esta conta`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        ok ? platformClass(check.platform) : "bg-warning/15 text-warning"
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {check.raw}
    </span>
  )
}

function PostRow({ post, canPublishNow, onPublished, issues }: { post: ScheduledPost; canPublishNow?: boolean; onPublished?: () => void; issues?: string[] }) {
  const { label, isPast } = timeUntil(post.scheduledDate)
  const checks = post.targetChecks ?? []
  const noTargets = checks.length === 0
  const hasIssue = checks.some((c) => !c.configured) || noTargets
  const allMissing = checks.length > 0 && checks.every((c) => !c.configured)
  const hasIssues = (issues?.length ?? 0) > 0
  const [publishing, setPublishing] = useState(false)

  async function publishNow() {
    if (!post.connectionId) return
    if (!confirm(`Publicar "${post.title || "este post"}" agora?`)) return
    setPublishing(true)
    try {
      const res = await fetch("/api/posts/publish-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: post.pageId, connectionId: post.connectionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao publicar")
      const ok = (data.results ?? []).filter((r: any) => r.status === "published").length
      const fail = (data.results ?? []).filter((r: any) => r.status === "failed").length
      const skip = (data.results ?? []).filter((r: any) => r.status === "skipped").length
      if (ok > 0 && fail === 0) toast.success(`Publicado em ${ok} plataforma(s)!`)
      else if (ok > 0) toast.warning(`${ok} publicado(s), ${fail} falhou(aram)`)
      else toast.error(fail > 0 ? `Falha ao publicar (${fail})` : `Nenhuma plataforma publicou (${skip} ignorada(s))`)
      onPublished?.()
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e))
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className={cn(
      "rounded-lg border bg-card p-4",
      hasIssues ? "border-warning/40 bg-warning/5" : hasIssue && "border-warning/40"
    )}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium truncate">{post.title || "Sem título"}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm text-muted-foreground">{formatDate(post.scheduledDate)}</p>
          {post.scheduledDate && (
            <p className={cn("text-xs font-medium", isPast ? "text-success" : "text-muted-foreground")}>
              {label}
            </p>
          )}
        </div>
      </div>

      {issues && issues.length > 0 && (
        <ul className="mt-3 space-y-1">
          {issues.map((issue) => (
            <li key={issue} className="flex items-start gap-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Publicar em:</span>
        {noTargets ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
            <AlertTriangle className="h-3 w-3" />
            Campo vazio
          </span>
        ) : (
          checks.map((c) => <TargetBadge key={c.raw} check={c} />)
        )}
        {hasIssue && !noTargets && (
          <Link href="/accounts" className="ml-1 text-xs text-warning underline">
            Configurar conta
          </Link>
        )}
        {canPublishNow && (
          <div className="ml-auto">
            <Button
              size="sm"
              onClick={publishNow}
              disabled={publishing || allMissing || noTargets || !post.connectionId}
              title={
                noTargets
                  ? 'Preencha o campo "Publicar em" no Notion'
                  : allMissing
                  ? "Nenhuma plataforma com conta conectada"
                  : "Publicar imediatamente"
              }
            >
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {publishing ? "Publicando..." : "Publicar agora"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
