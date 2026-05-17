import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Endpoint de debug — usado pelo painel admin pra verificar qual commit
// está em prod e quais env vars estão setadas. Exige sessão autenticada
// (qualquer user logado serve — não vaza segredos cross-tenant; só
// confirma presença + comprimento). Prefixos foram removidos pra não
// dar dicas de validação de credenciais por força bruta.
function maskEnv(value: string | undefined): { set: boolean; length: number } {
  return { set: !!value, length: value?.length ?? 0 }
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  return NextResponse.json(
    {
      build: "r5",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? "unknown",
      timestamp: new Date().toISOString(),
      env: {
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "MISSING",
        TIKTOK_CLIENT_KEY: maskEnv(process.env.TIKTOK_CLIENT_KEY),
        TIKTOK_CLIENT_SECRET: maskEnv(process.env.TIKTOK_CLIENT_SECRET),
        LINKEDIN_CLIENT_ID: maskEnv(process.env.LINKEDIN_CLIENT_ID),
        FACEBOOK_APP_ID: maskEnv(process.env.FACEBOOK_APP_ID),
        GOOGLE_CLIENT_ID: maskEnv(process.env.GOOGLE_CLIENT_ID),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    }
  )
}
