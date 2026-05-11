"use client"
/**
 * Production comment thread — agency + client comments mixed.
 *
 * Polls every 5s while mounted to pick up client comments coming in via
 * /approve/[token] decisions (kind=production_script, decision=
 * changes_requested → server inserts a productionComment row with
 * authorUserId=NULL, authorName=contactName).
 *
 * v1: no markdown rendering, no @mentions, no edit/delete. Just a plain
 * text feed + compose box. Mark-resolved checkbox per row (agency-only;
 * future filter could hide resolved by default).
 */

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, MessageCircle, Send, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Comment = {
  id: string
  body: string
  resolved: boolean
  createdAt: string
  authorName: string
  authorImage: string | null
  isClient: boolean
}

export function CommentThread({ productionId }: { productionId: string }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [body, setBody] = useState("")
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    try {
      const res = await fetch(`/api/productions/${productionId}/comments`)
      const data = await res.json()
      if (res.ok) setComments(data.comments ?? [])
    } catch {
      // Silent during polling — only show error on initial load
      if (!silent) toast.error("Falha ao carregar comentários")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    pollTimer.current = setInterval(() => load(true), 5000)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionId])

  async function postComment() {
    if (!body.trim()) return
    setPosting(true)
    try {
      const res = await fetch(`/api/productions/${productionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha ao postar")
      setBody("")
      await load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  async function toggleResolved(commentId: string, resolved: boolean) {
    try {
      const res = await fetch(`/api/productions/${productionId}/comments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, resolved }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? "Falha ao atualizar")
      }
      // Optimistic local update; reload silently for consistency.
      setComments((cs) => cs.map((c) => (c.id === commentId ? { ...c, resolved } : c)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground">
          Comentários ({comments.length})
        </h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : comments.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
          Nenhum comentário ainda. Conversa entre agência e cliente aparece aqui.
        </p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className={cn(
                "rounded-lg border bg-card p-3",
                c.isClient && "border-amber-300/50 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-950/20",
                c.resolved && "opacity-60",
              )}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {c.authorImage ? (
                    <img src={c.authorImage} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-semibold text-primary">
                      {c.authorName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <p className="truncate text-base font-medium">{c.authorName}</p>
                  {c.isClient && (
                    <span className="rounded-full bg-amber-200/60 px-1.5 py-0.5 text-[12px] font-medium uppercase tracking-wider text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                      Cliente
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-[13px] text-muted-foreground">
                  {timeAgo(c.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-base">{c.body}</p>
              <button
                type="button"
                onClick={() => toggleResolved(c.id, !c.resolved)}
                className={cn(
                  "mt-2 inline-flex items-center gap-1 text-[13px] font-medium",
                  c.resolved
                    ? "text-success"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <CheckCircle2 className="h-3 w-3" />
                {c.resolved ? "Resolvido" : "Marcar como resolvido"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Compose */}
      <div className="mt-4 rounded-lg border bg-card p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Adicione um comentário…"
          rows={3}
          className="w-full resize-none rounded-md border bg-background p-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={postComment} disabled={posting || !body.trim()}>
            {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Comentar
          </Button>
        </div>
      </div>
    </section>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "agora"
  if (mins < 60) return `há ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}
