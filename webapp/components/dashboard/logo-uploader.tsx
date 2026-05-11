"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// Square-crop, downscale and re-encode an uploaded image to a small
// WebP data URL. Stored directly in client.logoUrl (text column) —
// no Vercel Blob, no S3, no env vars. Trade-off: ~5-15 KB per logo
// inflates the row but that's fine for the dashboard scale; we skip
// the operational overhead of a storage layer entirely.
const TARGET_SIZE = 128
const WEBP_QUALITY = 0.85
const MAX_SOURCE_BYTES = 5 * 1024 * 1024  // 5 MB raw input

async function imageToWebpDataUrl(file: File): Promise<string> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Arquivo maior que 5MB. Use uma imagem menor.")
  }
  // decode() is preferred over onload — propagates errors properly.
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    // Square center-crop: read the central square of the source.
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - side) / 2
    const sy = (img.naturalHeight - side) / 2
    const canvas = document.createElement("canvas")
    canvas.width = TARGET_SIZE
    canvas.height = TARGET_SIZE
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas indisponível no navegador.")
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE)
    // Try WebP first; fall back to PNG if browser refuses (rare).
    let dataUrl = canvas.toDataURL("image/webp", WEBP_QUALITY)
    if (!dataUrl.startsWith("data:image/webp")) {
      dataUrl = canvas.toDataURL("image/png")
    }
    return dataUrl
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function LogoUploader({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [processing, setProcessing] = useState(false)
  const [mode, setMode] = useState<"upload" | "url">(
    // If the saved value is a remote URL (not a data URL), default to URL
    // mode so the user can see + edit the URL. Empty or data URL → upload.
    value && !value.startsWith("data:") ? "url" : "upload",
  )

  async function handleFile(file: File | null) {
    if (!file) return
    setProcessing(true)
    try {
      const dataUrl = await imageToWebpDataUrl(file)
      onChange(dataUrl)
      // Estimate compressed size for the user.
      const sizeKb = Math.round((dataUrl.length * 0.75) / 1024)
      toast.success(`Logo carregado (~${sizeKb} KB).`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar imagem.")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label>Logo / ícone</Label>

      <div className="flex items-start gap-3">
        {/* Preview */}
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm text-muted-foreground">Sem logo</span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {/* Mode switch */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={cn(
                "rounded-md border px-2 py-1 text-sm font-medium",
                mode === "upload"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-muted text-muted-foreground hover:bg-accent",
              )}
            >
              Subir arquivo
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={cn(
                "rounded-md border px-2 py-1 text-sm font-medium",
                mode === "url"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-muted text-muted-foreground hover:bg-accent",
              )}
            >
              Colar URL
            </button>
          </div>

          {mode === "upload" ? (
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={processing}
              >
                {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {value && value.startsWith("data:") ? "Trocar arquivo" : "Escolher arquivo"}
              </Button>
              {value && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange("")}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                  Remover
                </Button>
              )}
              <p className="text-sm text-muted-foreground">
                Cortado quadrado 128×128, comprimido pra ~5-15 KB. Salvo direto no banco.
              </p>
            </div>
          ) : (
            <Input
              value={value.startsWith("data:") ? "" : value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://exemplo.com/logo.png"
            />
          )}
        </div>
      </div>
    </div>
  )
}
