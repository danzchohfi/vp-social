import { NextResponse } from "next/server"
import { verifyProxySig } from "@/lib/tiktok-proxy"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get("url")
  const sig = searchParams.get("sig")
  if (!url || !sig) return NextResponse.json({ error: "missing url or sig" }, { status: 400 })
  if (!verifyProxySig(url, sig)) return NextResponse.json({ error: "invalid sig" }, { status: 403 })

  const upstream = await fetch(url)
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "upstream fetch failed", status: upstream.status }, { status: 502 })
  }
  const headers = new Headers()
  const contentType = upstream.headers.get("content-type")
  const contentLength = upstream.headers.get("content-length")
  if (contentType) headers.set("content-type", contentType)
  if (contentLength) headers.set("content-length", contentLength)
  headers.set("cache-control", "private, max-age=3600")

  return new Response(upstream.body, { status: 200, headers })
}
