// Web Push helper (Pilar 7 transversal: "notificação push PWA").
// Cliente final do portal /c/[token] pode ativar push pra ser avisado
// quando nova aprovação chega (alternativa ao WhatsApp).
//
// Ativação em produção: gerar VAPID keys uma única vez com
//   npx web-push generate-vapid-keys
// e setar VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT no
// Vercel. Sem as 3 vars, sendPushToClient vira no-op (não quebra).
// VAPID_SUBJECT é um mailto: do contato técnico ("mailto:ti@vitamina.com").
//
// Browser/PWA: client-side em /c/[token] registra service worker em
// /sw.js, pede permission, chama push.subscribe(applicationServerKey).
// O endpoint resultante volta pra POST /api/c/[token]/push.

import webpush from "web-push"
import { db } from "./db"
import { pushSubscription } from "./db/schema"
import { eq } from "drizzle-orm"

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:contato@producao.app"

let configured = false
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  configured = true
}

export function pushIsConfigured(): boolean {
  return configured
}

export function publicVapidKey(): string | null {
  return VAPID_PUBLIC ?? null
}

export type PushPayload = {
  title: string
  body: string
  url?: string
  icon?: string
}

/**
 * Dispara push pra todos os devices subscritos de um cliente. No-op
 * silencioso quando VAPID não configurado (dev sem keys, prod sem env).
 * Subscriptions com endpoint 410/404 são deletadas automaticamente —
 * o browser do cliente trocou de device ou revogou permission.
 */
export async function sendPushToClient(clientId: string, payload: PushPayload): Promise<void> {
  if (!configured) return
  const subs = await db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.clientId, clientId))
  if (subs.length === 0) return

  const json = JSON.stringify(payload)
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
        )
        await db
          .update(pushSubscription)
          .set({ lastUsedAt: new Date() })
          .where(eq(pushSubscription.id, s.id))
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        // 404 = endpoint expirado, 410 = removido pelo browser.
        // Em ambos casos limpa a subscription pra não acumular lixo.
        if (status === 404 || status === 410) {
          await db.delete(pushSubscription).where(eq(pushSubscription.id, s.id))
        }
      }
    }),
  )
}
