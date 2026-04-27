"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CalendarClock, Loader2, RefreshCw, Zap, Clock, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

type ScheduledPost = {
  pageId: string
  title: string
  conta: string
  tipo: string
  plataformas: string[]
  scheduledDate: string | null
}

const TIPO_COLORS: Record<string, string> = {
  feed: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  carrossel: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  reel: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  story: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  youtube: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  "youtube short": "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
}

function tipoClass(tipo: string) {
  return TIPO_COLORS[tipo.toLowerCase()] ?? "bg-muted text-muted-foreground"
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
  const readyNow = posts.filter((p) => p.scheduledDate && new Date(p.scheduledDate) <= now)
  const upcoming = posts.filter((p) => !p.scheduledDate || new Date(p.scheduledDate) > now)

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Posts agendados</h1>
          <p className="text-muted-foreground">Todos os posts com status de agendamento no Notion</p>
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
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
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
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-emerald-600">
                  Prontos para publicar agora ({readyNow.length})
                </h2>
              </div>
              <div className="space-y-2">
                {readyNow.map((post) => (
                  <PostRow key={post.pageId} post={post} />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Próximas publicações ({upcoming.length})
                </h2>
              </div>
              <div className="space-y-2">
                {upcoming.map((post) => (
                  <PostRow key={post.pageId} post={post} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function PostRow({ post }: { post: ScheduledPost }) {
  const { label, isPast } = timeUntil(post.scheduledDate)

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="min-w-0">
          <p className="font-medium truncate">{post.title || "Sem título"}</p>
          <p className="text-sm text-muted-foreground">{post.conta}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", tipoClass(post.tipo))}>
          {post.tipo}
        </span>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">{formatDate(post.scheduledDate)}</p>
          <p className={cn("text-xs font-medium", isPast ? "text-emerald-600" : "text-muted-foreground")}>
            {label}
          </p>
        </div>
      </div>
    </div>
  )
}
