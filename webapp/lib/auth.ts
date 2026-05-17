import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "@/lib/db"
import * as schema from "@/lib/db/schema"

// Warn loud quando o secret estiver vazio ou suspeitamente fraco.
// Better Auth assina sessões com HMAC desse secret — secret fraco =
// sessões falsificáveis. 32 chars min (256 bits hex) é o piso.
//
// Pra rotacionar em produção:
//   1. Gerar novo secret: `openssl rand -hex 32`
//   2. Setar BETTER_AUTH_SECRET no Vercel (Production + Preview).
//   3. Redeploy. Sessões antigas (assinadas com secret velho) ficam
//      inválidas — todos os users são deslogados, precisam login again.
//      Não há overlap de tolerância (Better Auth não suporta dual-secret).
//   4. Comunicar pro time antes — passar 1m logo após deploy resolve.
//
// docs/SECURITY.md tem o playbook completo.
const secret = process.env.BETTER_AUTH_SECRET
if (!secret) {
  console.warn("⚠ BETTER_AUTH_SECRET não setado — sessões assinadas com fallback do Better Auth. NÃO rodar em produção.")
} else if (secret.length < 32) {
  console.warn(`⚠ BETTER_AUTH_SECRET tem ${secret.length} chars — recomendado 32+ (256-bit hex). Rotacionar via 'openssl rand -hex 32'.`)
}

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  secret,
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
    // Senha mínima de 10 chars. Better Auth não tem complexity hooks
    // built-in — UI no /signup pode adicionar checks de força (digit,
    // uppercase, symbol) mas no servidor o min length é a barreira.
    // INFO-1 do audit.
    minPasswordLength: 10,
    maxPasswordLength: 256,
    // INFO-2: email verification obrigatório. Usuários existentes foram
    // backfilled como verified=true via migration 0025. Novos signups
    // precisam confirmar o email pra logar — protege contra registro
    // sob email alheio (atacante registra com seu email, espera você
    // tentar /forgot-password, etc).
    requireEmailVerification: true,
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
  emailVerification: {
    // sendOnSignUp=true → Better Auth dispara verification email assim que
    // o user faz POST /api/auth/sign-up. autoSignInAfterVerification=true
    // → ao clicar o link, sessão é criada automática (UX melhor que mandar
    // pra /login).
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      if (!process.env.RESEND_API_KEY) {
        console.log(`[EMAIL VERIFY — dev only] email=${user.email} url=${url}`)
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
            subject: "Confirme seu email — VP Social",
            html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <h2 style="margin:0 0 16px">Bem-vindo à VP Social</h2>
              <p>Clique no botão abaixo pra confirmar que esse email é seu:</p>
              <p style="margin:24px 0"><a href="${url}" style="background:#5b3df5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Confirmar email</a></p>
              <p style="color:#666;font-size:13px">Ou cole este link no navegador:<br/><a href="${url}">${url}</a></p>
              <p style="color:#999;font-size:12px;margin-top:32px">Se você não criou esta conta, ignore este email.</p>
            </div>`,
          }),
        })
        if (!res.ok) {
          console.error(`[sendVerificationEmail] Resend rejected for ${user.email}: ${res.status} ${await res.text()}`)
        }
      } catch (e) {
        console.error(`[sendVerificationEmail] error for ${user.email}:`, e)
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
