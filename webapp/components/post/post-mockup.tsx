"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Mockup interativo per-platform pro cliente avaliar o conteúdo antes
// de aprovar. Cada target (Instagram Feed, Carrossel, Reel, Story,
// YouTube, etc.) renderiza em formato que simula a aparência real:
//
//   - Carrossel: navegável (prev/next + dots) através de feedImageUrls
//   - Vídeo (Reel/Story/Short/YouTube): <video controls> playable
//   - Feed simples: imagem única em aspect square
//
// Compartilhado por /c/[token] (dialog de aprovação) e /approve/[token]
// (link direto via WhatsApp). Ambos precisam dessa view rica.

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
}

const PLATFORM_BG: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  facebook: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  youtube: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  tiktok: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  linkedin: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
}

export function PostMockup({ target, post }: { target: Target; post: PostMedia }) {
  const tipo = target.tipo.toLowerCase()
  const isVideo = tipo === "reel" || tipo === "story" || tipo === "youtube short" || tipo === "youtube"
  const isCarousel = tipo === "carrossel"

  const aspect = tipo === "reel" || tipo === "story" || tipo === "youtube short"
    ? "aspect-[9/16]"
    : tipo === "youtube"
      ? "aspect-video"
      : "aspect-square"

  const platformKey = target.platform.toLowerCase().split(/[\s-]+/)[0]
  const platformClass = PLATFORM_BG[platformKey] ?? "bg-muted text-muted-foreground"

  const containerWidthClass = tipo === "reel" || tipo === "story" || tipo === "youtube short"
    ? "max-w-sm mx-auto"
    : "w-full"

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="border-b px-3 py-2 flex items-center gap-2">
        <Badge className={cn("text-[12px]", platformClass)}>{target.raw}</Badge>
      </div>
      <div className={containerWidthClass}>
        <div className={cn("relative bg-muted", aspect)}>
          {isCarousel ? (
            <CarouselSlides urls={post.feedImageUrls} thumbnail={post.thumbnailUrl} />
          ) : isVideo ? (
            <VideoPlayer
              urls={tipo === "youtube" ? post.horizontalUrls : post.verticalUrls}
              poster={post.thumbnailUrl}
            />
          ) : (
            <SingleImage urls={post.feedImageUrls} fallback={post.thumbnailUrl ?? post.verticalUrls?.[0] ?? null} />
          )}
        </div>
      </div>
    </div>
  )
}

function CarouselSlides({ urls, thumbnail }: { urls: string[]; thumbnail: string | null }) {
  // Pra carrossel preferimos as imagens do feed (cada slide = 1 feedImage).
  // Se a agency upload uma thumbnail E múltiplas imagens, mostra thumb como
  // primeiro slide (capa do carrossel) seguida das feedImages.
  const slides: string[] = []
  if (thumbnail && !urls.includes(thumbnail)) slides.push(thumbnail)
  for (const u of urls) slides.push(u)

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
      {/* Slide indicator (dots) */}
      {slides.length > 1 && (
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
      )}
      {/* Navigation buttons */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Slide anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Próximo slide"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
      {/* Slide counter */}
      {slides.length > 1 && (
        <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
          {idx + 1}/{slides.length}
        </div>
      )}
    </>
  )
}

function VideoPlayer({ urls, poster }: { urls: string[]; poster: string | null }) {
  const url = urls?.[0]
  if (!url) {
    // Sem vídeo mas com thumbnail → mostra thumbnail como fallback (parecido com Instagram quando ainda não tem o arquivo final)
    if (poster) {
      return (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
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

  return (
    <video
      src={url}
      poster={poster ?? undefined}
      className="absolute inset-0 h-full w-full object-cover"
      controls
      muted
      playsInline
      preload="metadata"
    />
  )
}

function SingleImage({ urls, fallback }: { urls: string[]; fallback: string | null }) {
  const url = urls?.[0] ?? fallback
  if (!url) return <NoMediaPlaceholder />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
    />
  )
}

function NoMediaPlaceholder() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
      <AlertTriangle className="h-6 w-6 mb-1" />
      <span className="text-sm">Sem mídia</span>
    </div>
  )
}
