import { NextResponse } from "next/server"
import { verifyProxySig } from "@/lib/tiktok-proxy"

export const dynamic = "force-dynamic"
export const maxDuration = 60

async function proxy(req: Request, method: "GET" | "HEAD") {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get("url")
  const sig = searchParams.get("sig")
  if (!url || !sig) return NextResponse.json({ error: "missing url or sig" }, { status: 400 })
  if (!verifyProxySig(url, sig)) return NextResponse.json({ error: "invalid sig" }, { status: 403 })

  const forwardHeaders: HeadersInit = {}
  const range = req.headers.get("range")
  if (range) forwardHeaders["range"] = range

  const upstream = await fetch(url, { method, headers: forwardHeaders, redirect: "follow" })
  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json({ error: "upstream fetch failed", status: upstream.status }, { status: 502 })
  }

  const headers = new Headers()
  const passThrough = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]
  for (const h of passThrough) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  if (!headers.get("content-type")) headers.set("content-type", "video/mp4")
  if (!headers.get("accept-ranges")) headers.set("accept-ranges", "bytes")
  headers.set("cache-control", "public, max-age=3600")

  if (method === "HEAD") {
    return new Response(null, { status: upstream.status, headers })
  }
  return new Response(upstream.body, { status: upstream.status, headers })
}

export async function GET(req: Request) {
  return proxy(req, "GET")
}

export async function HEAD(req: Request) {
  return proxy(req, "HEAD")
}
