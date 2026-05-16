"use client"

import { useState } from "react"
import {
  ChevronLeft, ChevronRight, AlertTriangle,
  Heart, MessageCircle, Send, Bookmark, MoreHorizontal,
  ThumbsUp, Repeat2,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Mockup interativo per-platform pro cliente avaliar o conteúdo antes
// de aprovar. Cada target renderiza com chrome (header + footer) que
// simula a UI nativa da plataforma. Cliente vê o post como se já
// estivesse publicado.
//
//   - IG Feed / Carrossel: header com @conta + caption + ícones like/comment
//   - IG Reel / Story / YT Short / TikTok: vertical, controls de play,
//     overlay com @conta + caption
//   - YouTube: 16:9 + título embaixo + nome do canal
//   - Facebook: header de página + caption acima + image + reactions
//   - LinkedIn: header de empresa + caption + image + reactions
//
// Compartilhado por /c/[token] (dialog de aprovação/preview) e
// /approve/[token] (link direto via WhatsApp).

type Platform = "instagram" | "facebook" | "youtube" | "tiktok" | "linkedin"

type Target = {
  platform: Platform | string
  tipo: string
  raw: string
}

type PostMedia = {
  thumbnailUrl: string | null
  feedImageUrls: string[]
  verticalUrls: string[]
  horizontalUrls: string[]
  // Link externo (YouTube unlisted / Drive / Vimeo) usado quando agência
  // só tem o preview e ainda não exportou o arquivo final. Renderiza
  // como iframe embed quando reconhecemos o host; senão vira link.
  previewVerticalUrl?: string | null
  previewHorizontalUrl?: string | null
  allMediaUrls?: string[]
  fullCaption?: string
  conta?: string
}

// iOS Safari não renderiza primeiro frame de vídeo cross-origin sem
// um hint explícito. Adicionar #t=0.5 força seek inicial pra exibir
// o frame mesmo com preload=metadata.
function videoSeek(url: string): string {
  if (!url) return url
  if (url.includes("#t=")) return url
  return `${url}#t=0.5`
}

// Converte URL de YouTube (watch / youtu.be / shorts) em URL embed.
// Retorna null quando não é YouTube — caller cai pra link clicável.
function toYouTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, "")
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v")
        return id ? `https://www.youtube.com/embed/${id}` : null
      }
      const shortsMatch = u.pathname.match(/^\/shorts\/([^/?]+)/)
      if (shortsMatch) return `https://www.youtube.com/embed/${shortsMatch[1]}`
      if (u.pathname.startsWith("/embed/")) return url
    }
    return null
  } catch {
    return null
  }
}

// Pick external preview URL apropriado pro shape do mockup. YouTube
// long usa horizontal (16:9); shorts/reel/story/tiktok usam vertical (9:16);
// senão prefere vertical mas cai pra horizontal.
function pickPreviewUrl(post: PostMedia, tipo: string): string | null {
  const isHorizontal = tipo === "youtube"
  if (isHorizontal) {
    return post.previewHorizontalUrl ?? post.previewVerticalUrl ?? null
  }
  return post.previewVerticalUrl ?? post.previewHorizontalUrl ?? null
}

// Embed reconhecido = iframe; senão = card-link pra abrir noutra aba
// (Drive, Vimeo etc).
function PreviewExternal({ url }: { url: string }) {
  const embed = toYouTubeEmbed(url)
  if (embed) {
    return (
      <iframe
        src={embed}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        title="Preview do vídeo"
      />
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-muted p-4 text-center hover:bg-muted/80"
    >
      <span className="text-sm font-medium">Abrir preview do vídeo</span>
      <span className="text-[11px] text-muted-foreground break-all line-clamp-2">{url}</span>
    </a>
  )
}

function pickMedia(post: PostMedia, isVideo: boolean, tipo: string) {
  const videoUrl = isVideo
    ? (tipo === "youtube" ? post.horizontalUrls?.[0] : post.verticalUrls?.[0])
    : null
  const imgUrl = post.thumbnailUrl
    ?? post.feedImageUrls?.[0]
    ?? (!isVideo ? post.verticalUrls?.[0] ?? post.horizontalUrls?.[0] : null)
    ?? null

  // Fallback final: qualquer mídia que tenhamos do post (file fields
  // não mapeados pegos via allMediaUrls). Comum quando agency usa nomes
  // de campo customizados no Notion.
  const anyMedia = !videoUrl && !imgUrl && post.allMediaUrls?.length
    ? post.allMediaUrls[0]
    : null
  const looksLikeVideo = (url: string) => /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url)
  const fallbackIsVideo = anyMedia ? looksLikeVideo(anyMedia) : false

  return {
    videoUrl: videoUrl ?? (fallbackIsVideo ? anyMedia : null),
    imgUrl: imgUrl ?? (anyMedia && !fallbackIsVideo ? anyMedia : null),
  }
}

export function PostMockup({ target, post }: { target: Target; post: PostMedia }) {
  const tipo = target.tipo.toLowerCase()
  const platform = target.platform.toLowerCase().split(/[\s-]+/)[0] as Platform

  if (platform === "instagram") return <InstagramMockup tipo={tipo} target={target} post={post} />
  if (platform === "facebook") return <FacebookMockup tipo={tipo} target={target} post={post} />
  if (platform === "youtube") return <YouTubeMockup tipo={tipo} target={target} post={post} />
  if (platform === "tiktok") return <TikTokMockup tipo={tipo} target={target} post={post} />
  if (platform === "linkedin") return <LinkedInMockup tipo={tipo} target={target} post={post} />

  // Fallback genérico
  return <GenericMockup tipo={tipo} target={target} post={post} />
}

// ─── Instagram ──────────────────────────────────────────────

function InstagramMockup({ tipo, target, post }: { tipo: string; target: Target; post: PostMedia }) {
  const isReelOrStory = tipo === "reel" || tipo === "story"
  const isCarousel = tipo === "carrossel"
  const aspect = isReelOrStory ? "aspect-[9/16]" : "aspect-square"
  const containerWidth = isReelOrStory ? "max-w-[280px] mx-auto" : "w-full max-w-md mx-auto"

  return (
    <div className={cn("rounded-lg border bg-card overflow-hidden", containerWidth)}>
      {/* Header — avatar + username */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
          <div className="h-full w-full rounded-full bg-card flex items-center justify-center text-[10px] font-bold text-foreground">
            {(post.conta ?? "?").charAt(0).toUpperCase()}
          </div>
        </div>
        <span className="text-sm font-medium truncate flex-1">{post.conta || target.raw}</span>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Media */}
      <div className={cn("relative bg-muted", aspect)}>
        {isCarousel ? (
          <CarouselSlides post={post} />
        ) : isReelOrStory ? (
          <VideoOrPoster post={post} tipo={tipo} />
        ) : (
          <SingleImageOrVideo post={post} tipo={tipo} />
        )}
      </div>

      {/* Footer — ações + caption */}
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-3">
          <Heart className="h-5 w-5" />
          <MessageCircle className="h-5 w-5" />
          <Send className="h-5 w-5" />
          <Bookmark className="ml-auto h-5 w-5" />
        </div>
        {post.fullCaption && (
          <p className="text-xs whitespace-pre-wrap line-clamp-3">
            <span className="font-semibold">{post.conta || "username"}</span>{" "}
            {post.fullCaption}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Facebook ──────────────────────────────────────────────

function FacebookMockup({ tipo, target, post }: { tipo: string; target: Target; post: PostMedia }) {
  const isReel = tipo === "reel"
  const aspect = isReel ? "aspect-[9/16]" : "aspect-square"
  const containerWidth = isReel ? "max-w-[280px] mx-auto" : "w-full max-w-md mx-auto"

  return (
    <div className={cn("rounded-lg border bg-card overflow-hidden", containerWidth)}>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
          {(post.conta ?? "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{post.conta || target.raw}</p>
          <p className="text-[11px] text-muted-foreground">Patrocinado · 🌐</p>
        </div>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>

      {post.fullCaption && (
        <p className="px-3 pb-2 text-sm whitespace-pre-wrap line-clamp-4">{post.fullCaption}</p>
      )}

      <div className={cn("relative bg-muted", aspect)}>
        {isReel ? <VideoOrPoster post={post} tipo="reel" /> : <SingleImageOrVideo post={post} tipo={tipo} />}
      </div>

      <div className="flex items-center justify-around px-3 py-2 border-t text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><ThumbsUp className="h-4 w-4" /> Curtir</span>
        <span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> Comentar</span>
        <span className="flex items-center gap-1.5"><Send className="h-4 w-4" /> Compartilhar</span>
      </div>
    </div>
  )
}

// ─── YouTube ──────────────────────────────────────────────

function YouTubeMockup({ tipo, target, post }: { tipo: string; target: Target; post: PostMedia }) {
  const isShort = tipo === "youtube short"
  const aspect = isShort ? "aspect-[9/16]" : "aspect-video"
  const containerWidth = isShort ? "max-w-[280px] mx-auto" : "w-full max-w-2xl mx-auto"

  return (
    <div className={cn("rounded-lg border bg-card overflow-hidden", containerWidth)}>
      <div className={cn("relative bg-black", aspect)}>
        <VideoOrPoster post={post} tipo={isShort ? "youtube short" : "youtube"} />
      </div>
      <div className="px-3 py-2 space-y-1">
        <p className="text-sm font-semibold line-clamp-2">{post.fullCaption ? post.fullCaption.split("\n")[0] : target.raw}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-6 w-6 rounded-full bg-red-600 flex items-center justify-center text-white text-[10px] font-bold">
            {(post.conta ?? "?").charAt(0).toUpperCase()}
          </div>
          <span className="truncate">{post.conta || "canal"}</span>
          <span>·</span>
          <span>agora</span>
        </div>
      </div>
    </div>
  )
}

// ─── TikTok ──────────────────────────────────────────────

function TikTokMockup({ tipo: _tipo, target: _target, post }: { tipo: string; target: Target; post: PostMedia }) {
  return (
    <div className="rounded-lg border bg-black overflow-hidden max-w-[280px] mx-auto">
      <div className="relative aspect-[9/16] bg-black">
        <VideoOrPoster post={post} tipo="reel" />
        {/* Right rail actions */}
        <div className="absolute right-2 bottom-20 flex flex-col gap-3 items-center text-white">
          <Heart className="h-6 w-6 drop-shadow" />
          <MessageCircle className="h-6 w-6 drop-shadow" />
          <Send className="h-6 w-6 drop-shadow" />
        </div>
        {/* Bottom caption overlay */}
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent text-white space-y-1">
          <p className="text-sm font-semibold">@{post.conta || "usuario"}</p>
          {post.fullCaption && (
            <p className="text-xs whitespace-pre-wrap line-clamp-2">{post.fullCaption}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── LinkedIn ──────────────────────────────────────────────

function LinkedInMockup({ tipo, target, post }: { tipo: string; target: Target; post: PostMedia }) {
  const aspect = tipo === "video" ? "aspect-video" : "aspect-square"
  return (
    <div className="rounded-lg border bg-card overflow-hidden w-full max-w-md mx-auto">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-10 w-10 rounded bg-sky-700 flex items-center justify-center text-white text-sm font-bold">
          {(post.conta ?? "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{post.conta || target.raw}</p>
          <p className="text-[11px] text-muted-foreground">Empresa · agora</p>
        </div>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>

      {post.fullCaption && (
        <p className="px-3 pb-2 text-sm whitespace-pre-wrap line-clamp-4">{post.fullCaption}</p>
      )}

      <div className={cn("relative bg-muted", aspect)}>
        <SingleImageOrVideo post={post} tipo={tipo} />
      </div>

      <div className="flex items-center justify-around px-3 py-2 border-t text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><ThumbsUp className="h-4 w-4" /> Reagir</span>
        <span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> Comentar</span>
        <span className="flex items-center gap-1.5"><Repeat2 className="h-4 w-4" /> Repostar</span>
      </div>
    </div>
  )
}

// ─── Generic fallback ──────────────────────────────────────

function GenericMockup({ tipo, target, post }: { tipo: string; target: Target; post: PostMedia }) {
  const aspect = tipo === "reel" || tipo === "story" || tipo === "youtube short"
    ? "aspect-[9/16]"
    : tipo === "youtube" ? "aspect-video" : "aspect-square"
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b text-sm font-medium">{target.raw}</div>
      <div className={cn("relative bg-muted", aspect)}>
        <SingleImageOrVideo post={post} tipo={tipo} />
      </div>
    </div>
  )
}

// ─── Media renderers ──────────────────────────────────────

function CarouselSlides({ post }: { post: PostMedia }) {
  // Carrossel: 1 slide por imagem. Usa feedImageUrls quando agência
  // separou direitinho; cai pra vertical/horizontal quando o upload foi
  // num campo de outro aspect ratio (caso comum: cliente sobe carrossel
  // no campo "Mídia Vertical" porque é o único que conhece). Filtra
  // vídeos — carrossel = só imagens. allMediaUrls é o último recurso
  // quando o workspace usa nomes de campo fora do mapping.
  const looksLikeVideo = (url: string) => /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url)
  const slides: string[] = []
  function pushUnique(url: string) {
    if (looksLikeVideo(url)) return
    if (slides.includes(url)) return
    slides.push(url)
  }
  if (post.thumbnailUrl) pushUnique(post.thumbnailUrl)
  for (const u of post.feedImageUrls) pushUnique(u)
  if (slides.length === 0) {
    for (const u of post.verticalUrls) pushUnique(u)
    for (const u of post.horizontalUrls) pushUnique(u)
  }
  if (slides.length === 0 && post.allMediaUrls?.length) {
    for (const u of post.allMediaUrls) pushUnique(u)
  }

  const [idx, setIdx] = useState(0)

  if (slides.length === 0) return <NoMediaPlaceholder />

  const prev = () => setIdx((i) => (i - 1 + slides.length) % slides.length)
  const next = () => setIdx((i) => (i + 1) % slides.length)

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slides[idx]}
        alt={`Slide ${idx + 1}`}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {slides.length > 1 && (
        <>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {slides.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-all",
                  i === idx ? "bg-white" : "bg-white/40",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={prev}
            aria-label="Slide anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Próximo slide"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
            {idx + 1}/{slides.length}
          </div>
        </>
      )}
    </>
  )
}

function VideoOrPoster({ post, tipo }: { post: PostMedia; tipo: string }) {
  const { videoUrl, imgUrl } = pickMedia(post, true, tipo)

  if (videoUrl) {
    return (
      <video
        src={videoSeek(videoUrl)}
        poster={imgUrl ?? undefined}
        className="absolute inset-0 h-full w-full object-cover"
        controls
        muted
        playsInline
        preload="metadata"
      />
    )
  }
  // Sem arquivo de vídeo, mas com preview link (YouTube unlisted etc.) →
  // embed pro cliente aprovar o conteúdo bruto antes da exportação final.
  const previewUrl = pickPreviewUrl(post, tipo)
  if (previewUrl) return <PreviewExternal url={previewUrl} />
  if (imgUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/50 p-3">
            <span className="block h-0 w-0 border-y-[10px] border-l-[14px] border-y-transparent border-l-white" />
          </div>
        </div>
      </>
    )
  }
  return <NoMediaPlaceholder />
}

function SingleImageOrVideo({ post, tipo }: { post: PostMedia; tipo: string }) {
  const isVideo = tipo === "reel" || tipo === "story" || tipo === "youtube short" || tipo === "youtube" || tipo === "video"
  const { videoUrl, imgUrl } = pickMedia(post, isVideo, tipo)

  if (videoUrl) {
    return (
      <video
        src={videoSeek(videoUrl)}
        poster={imgUrl ?? undefined}
        className="absolute inset-0 h-full w-full object-cover"
        controls
        muted
        playsInline
        preload="metadata"
      />
    )
  }
  if (isVideo) {
    const previewUrl = pickPreviewUrl(post, tipo)
    if (previewUrl) return <PreviewExternal url={previewUrl} />
  }
  if (imgUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imgUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
    )
  }
  return <NoMediaPlaceholder />
}

function NoMediaPlaceholder() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
      <AlertTriangle className="h-6 w-6 mb-1" />
      <span className="text-sm font-medium">Mídia ainda não disponível</span>
      <span className="text-xs mt-0.5">A agência precisa fazer upload no Notion</span>
    </div>
  )
}
