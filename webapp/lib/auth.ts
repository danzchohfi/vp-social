import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "@/lib/db"
import * as schema from "@/lib/db/schema"

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      // Only log the URL when Resend isn't configured (dev fallback so the
      // engineer can grab the link from terminal). NEVER log it in production
      // — Vercel persists function logs and anyone with dashboard read access
      // could capture a valid reset link and hijack the account.
      if (!process.env.RESEND_API_KEY) {
        console.log(`[PASSWORD RESET — dev only] email=${user.email} url=${url}`)
        return
      }
      try {
        const from = process.env.RESEND_FROM ?? "VP Social <noreply@posts.vitaminapublicitaria.com.br>"
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: user.email,
            subject: "Redefinir sua senha — VP Social",
            html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <h2 style="margin:0 0 16px">Redefinir senha</h2>
              <p>Recebemos um pedido para redefinir a sua senha. Clique no botão abaixo:</p>
              <p style="margin:24px 0"><a href="${url}" style="background:#5b3df5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Redefinir senha</a></p>
              <p style="color:#666;font-size:13px">Ou cole este link no navegador:<br/><a href="${url}">${url}</a></p>
              <p style="color:#999;font-size:12px;margin-top:32px">Se você não pediu este reset, ignore este email — sua senha continua a mesma.</p>
            </div>`,
          }),
        })
        if (!res.ok) {
          // Log failure WITHOUT the URL — just enough to debug Resend issues.
          console.error(`[sendResetPassword] Resend rejected for ${user.email}: ${res.status} ${await res.text()}`)
        }
      } catch (e) {
        console.error(`[sendResetPassword] error for ${user.email}:`, e)
      }
    },
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    } : {}),
    facebook: {
      clientId: process.env.FACEBOOK_APP_ID!,
      clientSecret: process.env.FACEBOOK_APP_SECRET!,
      scopes: [
        "email",
        "public_profile",
        "instagram_basic",
        "instagram_content_publish",
        "pages_show_list",
        "pages_read_engagement",
      ],
    },
  },
})

export type Session = typeof auth.$Infer.Session
