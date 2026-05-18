// POST → registra/upserta uma push subscription pro cliente atual.
// DELETE → desregistra subscription (cliente revogou).
// GET → retorna VAPID public key + flag "isSubscribed" pra UI saber
//       se botão deve ser "Ativar" ou "Desativar".
//
// Token URL é a autorização (mesmo padrão do resto de /api/c/[token]).

import { db } from "@/lib/db"
import { client as clientTable, pushSubscription } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { publicVapidKey, pushIsConfigured } from "@/lib/push"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { randomUUID } from "crypto"

async function resolveClient(token: string) {
  const [row] = await db
    .select({ id: clientTable.id })
    .from(clientTable)
    .where(eq(clientTable.publicCalendarToken, token))
  return row ?? null
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ip = clientIp(req)
  if (checkRateLimit(`push-get:${ip}`, { max: 60, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }
  const c = await resolveClient(token)
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Sem VAPID keys configuradas, a feature não existe pro frontend.
  if (!pushIsConfigured()) {
    return NextResponse.json({ enabled: false, vapidKey: null, subscribedCount: 0 })
  }

  const subs = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.clientId, c.id))

  return NextResponse.json({
    enabled: true,
    vapidKey: publicVapidKey(),
    subscribedCount: subs.length,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ip = clientIp(req)
  if (checkRateLimit(`push-post:${ip}`, { max: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }
  const c = await resolveClient(token)
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const body = await req.json().catch(() => null) as null | {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
    userAgent?: string
  }
  if (!body?.endpoint || typeof body.endpoint !== "string"
      || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 })
  }
  if (!body.endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "endpoint deve ser HTTPS" }, { status: 400 })
  }

  // Upsert por endpoint (UNIQUE constraint). Renova p256dh/auth caso
  // o cliente tenha re-subscritado.
  const ua = typeof body.userAgent === "string" ? body.userAgent.slice(0, 200) : null
  await db
    .insert(pushSubscription)
    .values({
      id: randomUUID(),
      clientId: c.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: ua,
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        clientId: c.id,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: ua,
      },
    })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ip = clientIp(req)
  if (checkRateLimit(`push-del:${ip}`, { max: 30, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }
  const c = await resolveClient(token)
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const endpoint = searchParams.get("endpoint")
  if (!endpoint) {
    return NextResponse.json({ error: "missing_endpoint" }, { status: 400 })
  }
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.clientId, c.id), eq(pushSubscription.endpoint, endpoint)))
  return NextResponse.json({ ok: true })
}
