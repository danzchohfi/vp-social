"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, AlertTriangle, Loader2, Clock, Building2, MessageCircle, FileText, Users, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ScriptEditor } from "@/components/productions/script-editor"
import { PostMockup } from "@/components/post/post-mockup"

// Public approval page — opened by the client from a WhatsApp link.
// No auth required; the URL token IS the auth. After deciding, redirects
// to /c/{client-token} so the client lands on their permanent calendar
// view and can approve any other pending posts in the same session.

type TargetCheck = {
  raw: string
  platform: string
  tipo: string
}

type PostInfo = {
  pageId: string
  title: string
  conta: string
  fullCaption: string
  feedImageUrls: string[]
  verticalUrls: string[]
  horizontalUrls: string[]
  thumbnailUrl: string | null
  publishTargets: TargetCheck[]
  scheduledDate: string | null
  notionUrl: string
}

type ProductionInfo = {
  id: string
  title: string
  type: string
  specialistName: string | null
  scriptJson: string | null
}

type ChainContext = {
  stepOrder: number
  totalSteps: number
  round: number
  previousApprovers: Array<{ name: string; approvedAt: string | null }>
}

type CommentInfo = {
  id: string
  text: string
  createdTime: string
  kind: "client" | "agency" | "system"
  authorLabel: string | null
}

type ApiResponse = {
  state: "ok" | "decided" | "expired"
  decision: "approved" | "changes_requested" | null
  decidedAt: string | null
  // sentAt = when WhatsApp foi entregue (Meta Cloud) ou cron marcou link
  // como manual_wame. expiresAt = sentAt + 30d (TTL pra aprovação tácita).
  // Pra sentVia='meta_cloud': após 30d sem resposta vira aprovação tácita
  // (cron tacitApprovalSweep). Outros sentVia: link fica pendente até
  // alguém decidir ou agency expirar manualmente.
  sentAt: string | null
  sentVia: string | null
  expiresAt: string | null
  // True quando aprovação foi automática (silêncio em 30d) em vez de
  // explícita. UI mostra texto e ícone diferentes nesse caso.
  tacit: boolean
  contactName: string | null
  // Other pending approvals for the same client. When >0, we show a
  // sibling banner so the client knows there's more in the queue.
  pendingSiblings: number
  // Discriminator (May 2026): 'post' = legacy Notion-page approval,
  // 'production_script' = new production-script approval (chain step).
  kind?: "post" | "production_script"
  client: {
    name: string
    logoUrl: string | null
    calendarUrl: string
  }
  post?: PostInfo | null
  production?: ProductionInfo | null
  chainContext?: ChainContext | null
  // Thread de comentários da página do Notion (lido via listComments).
  // Inclui audit msgs do sistema + comentários do cliente (prefixados
  // [Nome]) + replies da agency (digitados direto no Notion sidebar).
  comments?: CommentInfo[]
  error?: string
}

// Common quick-edit phrases. Tapping a chip appends to the textarea
// (or replaces if empty). Phrased to be specific — generic "ajustar"
// without context defeats the purpose.
const QUICK_CHIPS = [
  "Trocar a thumb",
  "Ajustar a legenda",
  "Trocar a mídia",
  "Mudar a data/horário",
  "Texto está pequeno demais",
  "Conteúdo OK, só pequenos ajustes",
] as const

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const isPast = diff > 0
  const abs = Math.abs(diff)
  const mins = Math.floor(abs / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return isPast ? `há ${days}d` : `em ${days}d`
  if (hours > 0) return isPast ? `há ${hours}h` : `em ${hours}h`
  return isPast ? `há ${mins}min` : `em ${mins}min`
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-700",
  facebook: "bg-blue-100 text-blue-700",
  youtube: "bg-red-100 text-red-700",
  tiktok: "bg-purple-100 text-purple-700",
  linkedin: "bg-sky-100 text-sky-700",
}

function platformClass(platform: string) {
  return PLATFORM_COLORS[platform.toLowerCase()] ?? "bg-muted text-muted-foreground"
}

export default function ApprovalPage() {
  const router = useRouter()
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<"approved" | "changes_requested" | null>(null)
  // 3-state: null (botões de decisão visíveis), "changes" (textarea pra
  // pedir alterações + envia decisão), "message" (textarea pra comentar
  // sem decidir — endpoint /comment).
  const [commentMode, setCommentMode] = useState<null | "changes" | "message">(null)
  const [comment, setComment] = useState("")
  const [sendingMessage, setSendingMessage] = useState(false)

  async function refetch() {
    if (!token) return
    const r = await fetch(`/api/approve/${token}`)
    const fresh = await r.json().catch(() => null)
    if (fresh) setData(fresh)
  }

  useEffect(() => {
    if (!token) return
    fetch(`/api/approve/${token}`)
      .then(async (r) => {
        if (r.status === 404) {
          setError("Link inválido — peça pra agência reenviar.")
          return
        }
        const json = await r.json().catch(() => null)
        if (!json) {
          setError("Erro ao carregar — tente recarregar a página.")
          return
        }
        setData(json)
      })
      .finally(() => setLoading(false))
  }, [token])

  async function sendMessage() {
    const text = comment.trim()
    if (!text) {
      toast.error("Escreva uma mensagem antes de enviar.")
      return
    }
    setSendingMessage(true)
    try {
      const res = await fetch(`/api/approve/${token}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: text }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error ?? "Erro ao enviar mensagem")
      }
      toast.success("Mensagem enviada! A agência vai responder em breve.")
      setComment("")
      setCommentMode(null)
      // Refresh comments thread so cliente vê própria mensagem na conversa.
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSendingMessage(false)
    }
  }

  async function decide(decision: "approved" | "changes_requested") {
    if (decision === "changes_requested" && !comment.trim()) {
      toast.error("Escreva o que precisa ajustar antes de enviar.")
      return
    }
    setSubmitting(decision)
    try {
      const res = await fetch(`/api/approve/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment: comment.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          toast.error("Esse post já foi decidido.")
          // Refresh state to show the decided UI
          const r = await fetch(`/api/approve/${token}`)
          const fresh = await r.json()
          setData(fresh)
          return
        }
        throw new Error(json.error ?? "Erro ao registrar decisão")
      }
      toast.success(decision === "approved" ? "Aprovado! A agência foi avisada." : "Comentário enviado!")
      // Redirect to calendar so client sees their other posts.
      setTimeout(() => router.push(json.calendarUrl), 800)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSubmitting(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" />
            <p className="text-lg font-medium">{error ?? "Erro desconhecido"}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (data.state === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center">
            <Clock className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">Link expirado</p>
            <p className="mt-2 text-base text-muted-foreground">
              Esse link de aprovação tem 14 dias de validade. Peça pra {data.client.name} reenviar.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (data.state === "decided") {
    const isApproved = data.decision === "approved"
    const isTacit = isApproved && data.tacit
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center">
            {isTacit ? (
              <Clock className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            ) : isApproved ? (
              <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-success" />
            ) : (
              <MessageCircle className="mx-auto mb-4 h-12 w-12 text-warning" />
            )}
            <p className="text-lg font-medium">
              {isTacit
                ? "Aprovação automática registrada"
                : isApproved
                  ? "Você já aprovou esse post"
                  : "Você já pediu alterações"}
            </p>
            {isTacit && data.sentAt && data.decidedAt && (
              <p className="mt-3 text-sm text-muted-foreground">
                Esse post foi aprovado automaticamente em{" "}
                <strong>{new Date(data.decidedAt).toLocaleDateString("pt-BR")}</strong>
                {" "}porque ficou 30 dias sem resposta desde o envio em{" "}
                <strong>{new Date(data.sentAt).toLocaleDateString("pt-BR")}</strong>.
              </p>
            )}
            {!isTacit && data.decidedAt && (
              <p className="mt-2 text-base text-muted-foreground">
                {new Date(data.decidedAt).toLocaleString("pt-BR")}
              </p>
            )}
            {data.pendingSiblings > 0 && (
              <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-base text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                Você ainda tem <strong>{data.pendingSiblings}</strong> outro{data.pendingSiblings > 1 ? "s" : ""} post{data.pendingSiblings > 1 ? "s" : ""} aguardando sua aprovação.
              </p>
            )}
            <Button asChild className="mt-6">
              <a href={data.client.calendarUrl}>
                {data.pendingSiblings > 0 ? "Ver pendentes" : "Ver agenda completa"}
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Production-script branch ──────────────────────────────
  // No Notion preview; renders the script body via TipTap read-only +
  // chain context ("Aprovação 2 de 3 — João Silva já aprovou").
  if (data.kind === "production_script") {
    return (
      <ProductionScriptApprovalView
        data={data}
        comment={comment}
        setComment={setComment}
        showCommentBox={commentMode === "changes"}
        setShowCommentBox={(b) => setCommentMode(b ? "changes" : null)}
        submitting={submitting}
        decide={decide}
      />
    )
  }

  // state === "ok" — render the post decision UI
  const post = data.post
  if (!post) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-warning" />
            <p className="text-lg font-medium">Post não encontrado no Notion</p>
            <p className="mt-2 text-base text-muted-foreground">
              Pode ter sido removido. Peça pra {data.client.name} criar novamente.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-background">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[36rem] overflow-hidden">
        <div className="absolute left-1/2 top-[-12rem] h-[44rem] w-[44rem] -translate-x-1/2 rounded-full aurora-bg" />
      </div>
      {/* Header */}
      <div className="border-b bg-card/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {data.client.logoUrl ? (
            <img src={data.client.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-wider text-muted-foreground">Aprovação de conteúdo</p>
            <p className="truncate text-lg">{data.client.name}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        {/* Sibling banner — when there are other pending approvals, surface
            the count + a link to the full calendar so the client can batch
            their decisions. Shown above the contact greeting so it's the
            first thing they see if there's a queue. */}
        {data.pendingSiblings > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-base text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
            <MessageCircle className="h-4 w-4 shrink-0" />
            <span>
              Você tem <strong>{data.pendingSiblings + 1}</strong> posts aguardando sua aprovação no total.
            </span>
            <a
              href={data.client.calendarUrl}
              className="ml-auto rounded-md border border-amber-700/30 bg-amber-100 px-2 py-0.5 text-sm font-medium hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60"
            >
              Ver todos
            </a>
          </div>
        )}

        {data.contactName && (
          <p className="mb-2 text-base text-muted-foreground">
            Olá <strong className="text-foreground">{data.contactName}</strong>, esse post está aguardando a sua aprovação:
          </p>
        )}

        {/* Meta-line: when sent. */}
        {data.sentAt && (
          <p className="mb-2 text-sm text-muted-foreground">
            Enviado {formatRelative(data.sentAt)}
          </p>
        )}

        {/* Aprovação tácita: avisa o cliente que silêncio = aprovado em 30d.
            Só pra links enviados via Meta Cloud (sentVia='meta_cloud') porque
            é o caso onde o cron tacitApprovalSweep vai disparar. */}
        {data.sentAt && data.sentVia === "meta_cloud" && data.expiresAt && (
          <div className="mb-6 rounded-md border border-amber-700/30 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <Clock className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" />
            Sem resposta até <strong>{new Date(data.expiresAt).toLocaleDateString("pt-BR")}</strong> = aprovação automática.
          </div>
        )}

        {/* Post preview */}
        <Card className="mb-6 overflow-hidden">
          <CardHeader className="pb-3">
            <h2 className="text-xl truncate">{post.title || "Sem título"}</h2>
            <p className="text-sm text-muted-foreground">@{post.conta}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mockup interativo per-platform — carrossel navegável, vídeo
                playable. Cliente vê o conteúdo em tamanho real antes de aprovar. */}
            <div className="space-y-3">
              {post.publishTargets.map((t) => (
                <PostMockup key={t.raw} target={t} post={post} />
              ))}
            </div>

            {/* Caption */}
            {post.fullCaption && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm uppercase tracking-wider text-muted-foreground mb-1">Legenda</p>
                <p className="whitespace-pre-wrap text-base">{post.fullCaption}</p>
              </div>
            )}

            {/* Schedule info */}
            {post.scheduledDate && (
              <p className="text-sm text-muted-foreground">
                <Clock className="inline h-3 w-3 mr-1" />
                Agendado para {new Date(post.scheduledDate).toLocaleString("pt-BR")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Conversa — thread de comentários do Notion. Mostra mesmo
            quando vazia se o cliente abre a área "Mandar mensagem", pra
            ele já visualizar onde sua mensagem vai aparecer. */}
        <CommentThread
          comments={data.comments ?? []}
          contactName={data.contactName}
          clientName={data.client.name}
        />

        {/* Decision UI */}
        {commentMode === null ? (
          <div className="space-y-3">
            <Button
              size="xl"
              className="w-full bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => decide("approved")}
              disabled={submitting !== null}
            >
              {submitting === "approved" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              Aprovar
            </Button>
            <Button
              size="xl"
              variant="outline"
              className="w-full"
              onClick={() => setCommentMode("changes")}
              disabled={submitting !== null}
            >
              <MessageCircle className="h-5 w-5" />
              Pedir alterações
            </Button>
            <button
              type="button"
              onClick={() => setCommentMode("message")}
              disabled={submitting !== null}
              className="block w-full pt-1 text-center text-sm font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            >
              Mandar mensagem sem decidir
            </button>
            <p className="mt-3 text-center text-sm text-muted-foreground">
              Aprovando, esse post vai pra fila de publicação automática.
            </p>
          </div>
        ) : commentMode === "changes" ? (
          <div className="space-y-3">
            <div className="rounded-lg border p-4 bg-card">
              <label className="text-base font-medium block mb-2">O que precisa ajustar?</label>
              {/* Quick chips — tap appends to the textarea. Discourages
                  vague replies ("ajustar"); each chip is a phrased starter
                  the client can flesh out. */}
              <div className="mb-2 flex flex-wrap gap-1.5">
                {QUICK_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setComment((prev) => {
                        const trimmed = prev.trim()
                        if (!trimmed) return chip
                        // Avoid duplicating the same chip if the user taps twice.
                        if (trimmed.toLowerCase().includes(chip.toLowerCase())) return prev
                        return `${trimmed}\n${chip}`
                      })
                    }}
                    disabled={submitting !== null}
                    className="rounded-full border bg-background px-2.5 py-1 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
              <textarea
                autoFocus
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ex: trocar a thumb por uma mais clara, ajustar a legenda..."
                rows={5}
                className="w-full rounded-md border bg-background p-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={submitting !== null}
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Esse comentário vai como mensagem pra agência no Notion + marca o post como precisando de ajustes.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setCommentMode(null); setComment("") }}
                disabled={submitting !== null}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={() => decide("changes_requested")}
                disabled={submitting !== null || !comment.trim()}
              >
                {submitting === "changes_requested" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
                Enviar comentário
              </Button>
            </div>
          </div>
        ) : (
          // commentMode === "message" — comentário sem decidir.
          // POST /api/approve/{token}/comment; post fica pendente.
          <div className="space-y-3">
            <div className="rounded-lg border p-4 bg-card">
              <label className="text-base font-medium block mb-2">Mandar uma mensagem pra agência</label>
              <textarea
                autoFocus
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ex: tem como fazer uma versão mais clara? estou em dúvida sobre a chamada..."
                rows={5}
                className="w-full rounded-md border bg-background p-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={sendingMessage}
              />
              <p className="mt-2 text-sm text-muted-foreground">
                A mensagem vai aparecer pra agência como comentário no Notion. O post fica aguardando sua aprovação.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setCommentMode(null); setComment("") }}
                disabled={sendingMessage}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={sendMessage}
                disabled={sendingMessage || !comment.trim()}
              >
                {sendingMessage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar mensagem
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Renders the chronological Notion-comment thread for the post. Audit
// messages from the system (✓, 🔁, ⏰) get a subdued style; client
// messages ([Nome]) are highlighted; agency replies (sem prefixo) ficam
// neutral. Empty thread renders a single placeholder so the cliente sabe
// onde a mensagem dele vai aparecer.
function CommentThread({
  comments,
  contactName,
  clientName,
}: {
  comments: CommentInfo[]
  contactName: string | null
  clientName: string
}) {
  if (comments.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-center text-sm text-muted-foreground">
        Nenhuma mensagem ainda. Você pode mandar uma mensagem sem decidir se quiser tirar dúvida com a agência.
      </div>
    )
  }
  return (
    <div className="mb-4 rounded-lg border bg-card">
      <div className="border-b px-4 py-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Conversa
      </div>
      <ul className="divide-y">
        {comments.map((c) => {
          const isMe = c.kind === "client"
            && c.authorLabel
            && contactName
            && c.authorLabel.toLowerCase() === contactName.toLowerCase()
          const author = c.kind === "system"
            ? "Sistema"
            : c.kind === "client"
              ? (isMe ? "Você" : (c.authorLabel ?? "Cliente"))
              : clientName
          return (
            <li
              key={c.id}
              className={cn(
                "px-4 py-3",
                c.kind === "system" && "bg-muted/30",
                isMe && "bg-primary/5",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-sm font-medium",
                    c.kind === "system" && "text-muted-foreground italic",
                    isMe && "text-primary",
                    c.kind === "agency" && "text-foreground",
                  )}
                >
                  {author}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(c.createdTime).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p
                className={cn(
                  "whitespace-pre-wrap text-base",
                  c.kind === "system" && "text-sm text-muted-foreground",
                )}
              >
                {c.text}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Per-platform mockup tile. Picks the right aspect ratio + media URL
// ─── Production-script approval view ─────────────────────────────
// Mobile-first script reader with chain context up top + read-only TipTap
// body + same approve/changes-requested UI as the post view.
function ProductionScriptApprovalView({
  data,
  comment,
  setComment,
  showCommentBox,
  setShowCommentBox,
  submitting,
  decide,
}: {
  data: ApiResponse
  comment: string
  setComment: (s: string | ((prev: string) => string)) => void
  showCommentBox: boolean
  setShowCommentBox: (b: boolean) => void
  submitting: "approved" | "changes_requested" | null
  decide: (decision: "approved" | "changes_requested") => void
}) {
  const prod = data.production
  const ctx = data.chainContext
  if (!prod) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-warning" />
            <p className="text-lg font-medium">Roteiro não encontrado</p>
            <p className="mt-2 text-base text-muted-foreground">
              Pode ter sido removido. Peça pra {data.client.name} criar novamente.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-background">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[36rem] overflow-hidden">
        <div className="absolute left-1/2 top-[-12rem] h-[44rem] w-[44rem] -translate-x-1/2 rounded-full aurora-bg" />
      </div>
      {/* Header */}
      <div className="border-b bg-card/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {data.client.logoUrl ? (
            <img src={data.client.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-wider text-muted-foreground">Aprovação de roteiro</p>
            <p className="truncate text-lg">{data.client.name}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        {/* Chain banner — shows step + previous approvers */}
        {ctx && ctx.totalSteps > 1 && (
          <div className="mb-4 rounded-lg border bg-card px-3 py-2.5 text-base">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4 shrink-0" />
              <span>
                Aprovação <strong className="text-foreground">{ctx.stepOrder} de {ctx.totalSteps}</strong>
                {ctx.round > 1 && <> · revisão {ctx.round}</>}
              </span>
            </div>
            {ctx.previousApprovers.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
                {ctx.previousApprovers.map((a) => (
                  <span
                    key={a.name}
                    className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 font-medium text-success"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {a.name} aprovou
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {data.contactName && (
          <p className="mb-2 text-base text-muted-foreground">
            Olá <strong className="text-foreground">{data.contactName}</strong>, esse roteiro está aguardando a sua aprovação:
          </p>
        )}

        {data.sentAt && (
          <p className="mb-2 text-sm text-muted-foreground">
            Enviado {formatRelative(data.sentAt)}
          </p>
        )}

        {data.sentAt && data.sentVia === "meta_cloud" && data.expiresAt && (
          <div className="mb-6 rounded-md border border-amber-700/30 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <Clock className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" />
            Sem resposta até <strong>{new Date(data.expiresAt).toLocaleDateString("pt-BR")}</strong> = aprovação automática.
          </div>
        )}

        {/* Production card */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-xl truncate">{prod.title || "Sem título"}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {prod.type === "podcast" ? "Podcast" : "Vídeo"}
              {prod.specialistName ? ` · ${prod.specialistName}` : ""}
            </p>
          </CardHeader>
          <CardContent>
            {prod.scriptJson ? (
              <ScriptEditor
                initialJson={prod.scriptJson}
                editable={false}
                className="border-0"
              />
            ) : (
              <p className="text-base text-muted-foreground italic">Roteiro vazio</p>
            )}
          </CardContent>
        </Card>

        {/* Decision UI — same as post view */}
        {!showCommentBox ? (
          <div className="space-y-3">
            <Button
              size="xl"
              className="w-full bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => decide("approved")}
              disabled={submitting !== null}
            >
              {submitting === "approved" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              Aprovar roteiro
            </Button>
            <Button
              size="xl"
              variant="outline"
              className="w-full"
              onClick={() => setShowCommentBox(true)}
              disabled={submitting !== null}
            >
              <MessageCircle className="h-5 w-5" />
              Pedir alterações
            </Button>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {ctx && ctx.stepOrder < ctx.totalSteps
                ? "Aprovando, o roteiro vai para o próximo aprovador na fila."
                : "Aprovando, o roteiro fica liberado para gravação."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border p-4 bg-card">
              <label className="text-base font-medium block mb-2">O que precisa ajustar no roteiro?</label>
              <textarea
                autoFocus
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ex: trocar a abertura, encurtar a parte 2, adicionar exemplo concreto..."
                rows={5}
                className="w-full rounded-md border bg-background p-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={submitting !== null}
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Esse comentário vai pra equipe da agência junto com o pedido de revisão.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setShowCommentBox(false); setComment("") }}
                disabled={submitting !== null}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={() => decide("changes_requested")}
                disabled={submitting !== null || !comment.trim()}
              >
                {submitting === "changes_requested" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
                Enviar comentário
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
