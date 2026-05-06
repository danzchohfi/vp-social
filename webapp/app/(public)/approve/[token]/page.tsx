"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, AlertTriangle, Loader2, Clock, Building2, MessageCircle, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

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

type ApiResponse = {
  state: "ok" | "decided" | "expired"
  decision: "approved" | "changes_requested" | null
  decidedAt: string | null
  contactName: string | null
  client: {
    name: string
    logoUrl: string | null
    calendarUrl: string
  }
  post: PostInfo | null
  error?: string
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
  const [showCommentBox, setShowCommentBox] = useState(false)
  const [comment, setComment] = useState("")

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
            <p className="mt-2 text-sm text-muted-foreground">
              Esse link de aprovação tem 14 dias de validade. Peça pra {data.client.name} reenviar.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (data.state === "decided") {
    const isApproved = data.decision === "approved"
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center">
            {isApproved ? (
              <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-success" />
            ) : (
              <MessageCircle className="mx-auto mb-4 h-12 w-12 text-warning" />
            )}
            <p className="text-lg font-medium">
              {isApproved ? "Você já aprovou esse post" : "Você já pediu alterações"}
            </p>
            {data.decidedAt && (
              <p className="mt-2 text-sm text-muted-foreground">
                {new Date(data.decidedAt).toLocaleString("pt-BR")}
              </p>
            )}
            <Button asChild className="mt-6">
              <a href={data.client.calendarUrl}>Ver agenda completa</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // state === "ok" — render the decision UI
  const post = data.post
  if (!post) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-warning" />
            <p className="text-lg font-medium">Post não encontrado no Notion</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Pode ter sido removido. Peça pra {data.client.name} criar novamente.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {data.client.logoUrl ? (
            <img src={data.client.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Aprovação de conteúdo</p>
            <p className="truncate font-display text-lg">{data.client.name}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        {data.contactName && (
          <p className="mb-6 text-sm text-muted-foreground">
            Olá <strong className="text-foreground">{data.contactName}</strong>, esse post está aguardando a sua aprovação:
          </p>
        )}

        {/* Post preview */}
        <Card className="mb-6 overflow-hidden">
          <CardHeader className="pb-3">
            <h2 className="font-display text-xl truncate">{post.title || "Sem título"}</h2>
            <p className="text-xs text-muted-foreground">@{post.conta}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Per-platform mockups */}
            <div className="grid gap-3 sm:grid-cols-2">
              {post.publishTargets.map((t) => (
                <PlatformPreview key={t.raw} target={t} post={post} />
              ))}
            </div>

            {/* Caption */}
            {post.fullCaption && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Legenda</p>
                <p className="whitespace-pre-wrap text-sm">{post.fullCaption}</p>
              </div>
            )}

            {/* Schedule info */}
            {post.scheduledDate && (
              <p className="text-xs text-muted-foreground">
                <Clock className="inline h-3 w-3 mr-1" />
                Agendado para {new Date(post.scheduledDate).toLocaleString("pt-BR")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Decision UI */}
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
              Aprovar
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
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Aprovando, esse post vai pra fila de publicação automática.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border p-4 bg-card">
              <label className="text-sm font-medium block mb-2">O que precisa ajustar?</label>
              <textarea
                autoFocus
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ex: trocar a thumb por uma mais clara, ajustar a legenda..."
                rows={5}
                className="w-full rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={submitting !== null}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Esse comentário vai como mensagem pra agência no Notion.
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

// Per-platform mockup tile. Picks the right aspect ratio + media URL
// based on the publish target's tipo. Uses thumbnailUrl with a play
// overlay for video targets (avoids the broken-image issue we hit before
// when rendering raw video URLs inside <img>).
function PlatformPreview({ target, post }: { target: TargetCheck; post: PostInfo }) {
  const tipo = target.tipo.toLowerCase()
  const isVideoTarget = tipo === "reel" || tipo === "story" || tipo === "youtube short" || tipo === "youtube"

  const aspect = tipo === "reel" || tipo === "story" || tipo === "youtube short"
    ? "aspect-[9/16]"
    : tipo === "youtube"
      ? "aspect-video"
      : "aspect-square"

  let mediaUrl: string | null = null
  let mediaKind: "image" | "video" = "image"

  if (isVideoTarget) {
    if (post.thumbnailUrl) {
      mediaUrl = post.thumbnailUrl
      mediaKind = "image"
    } else {
      const url = tipo === "youtube" ? post.horizontalUrls?.[0] : post.verticalUrls?.[0]
      if (url) {
        mediaUrl = url
        mediaKind = "video"
      }
    }
  } else {
    mediaUrl = post.feedImageUrls?.[0] ?? post.thumbnailUrl ?? post.verticalUrls?.[0] ?? null
    mediaKind = "image"
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="border-b px-3 py-2">
        <Badge className={cn("text-[10px]", platformClass(target.platform))}>{target.raw}</Badge>
      </div>
      <div className={cn("relative bg-muted", aspect)}>
        {mediaKind === "image" && mediaUrl && (
          <img src={mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {mediaKind === "video" && mediaUrl && (
          <video
            src={mediaUrl}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        )}
        {mediaUrl && isVideoTarget && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-full bg-black/50 p-3">
              <Play className="h-6 w-6 text-white" fill="white" />
            </div>
          </div>
        )}
        {!mediaUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <AlertTriangle className="h-6 w-6 mb-1" />
            <span className="text-xs">Sem mídia</span>
          </div>
        )}
      </div>
    </div>
  )
}
