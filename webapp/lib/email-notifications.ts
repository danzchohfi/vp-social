import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// Lightweight email helper for publish-failure notifications. Reuses the
// same Resend setup the auth flow uses for password resets — no new
// dependency. Best-effort: failures are logged and swallowed so they
// never break the publish flow.

type FailedPublish = {
  postTitle: string | null
  conta: string | null
  platform: string | null
  error: string | null
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://posts.vitaminapublicitaria.com.br"

export async function notifyPublishFailure(
  userId: string,
  clientName: string | null,
  failure: FailedPublish
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    // Dev fallback — just log so the engineer sees what would have gone out.
    console.log(`[publish-failure email — dev only] user=${userId} client=${clientName ?? "—"} title="${failure.postTitle}" platform=${failure.platform} error=${failure.error}`)
    return
  }

  // Look up the user's email. We only notify the post owner (single recipient)
  // — multi-member notifications would need a preference layer first.
  const [u] = await db.select({ email: userTable.email, name: userTable.name }).from(userTable).where(eq(userTable.id, userId))
  if (!u?.email) return

  const from = process.env.RESEND_FROM ?? "VP Social <noreply@posts.vitaminapublicitaria.com.br>"
  const subject = `Falha ao publicar: ${failure.postTitle || "post sem título"}`
  const platform = failure.platform || "—"
  const errorText = failure.error || "Sem detalhes"
  const clientLabel = clientName ? ` (${clientName})` : ""
  const link = `${APP_URL}/scheduled?filter=errors`

  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
    <h2 style="margin:0 0 16px;font-size:20px">⚠ Publicação falhou${clientLabel}</h2>
    <p style="margin:0 0 8px"><strong>Post:</strong> ${escape(failure.postTitle || "sem título")}</p>
    <p style="margin:0 0 8px"><strong>Conta:</strong> ${escape(failure.conta || "—")}</p>
    <p style="margin:0 0 8px"><strong>Plataforma:</strong> ${escape(platform)}</p>
    <div style="background:#fee;border:1px solid #fcc;border-radius:8px;padding:12px;margin:16px 0;font-family:monospace;font-size:13px;word-break:break-word">
      ${escape(errorText)}
    </div>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#5b3df5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">Ver erros no VP Social</a>
    </p>
    <p style="color:#888;font-size:12px;margin-top:32px">
      Notificado para ${escape(u.name ?? u.email)}. Se preferir não receber estes alertas, fale conosco.
    </p>
  </div>`

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: u.email, subject, html }),
    })
    if (!res.ok) {
      console.error(`[notifyPublishFailure] Resend rejected for ${u.email}: ${res.status} ${await res.text()}`)
    }
  } catch (e) {
    console.error(`[notifyPublishFailure] error for ${u.email}:`, e)
  }
}

// Fire-and-forget version — caller doesn't await, never fails caller.
export function notifyPublishFailureAsync(
  userId: string,
  clientName: string | null,
  failure: FailedPublish
): void {
  notifyPublishFailure(userId, clientName, failure).catch((e) => {
    console.warn("[notifyPublishFailure] background notify failed:", e)
  })
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
