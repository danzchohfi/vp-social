import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

function maskEnv(value: string | undefined): string {
  if (!value) return "MISSING"
  if (value.length < 8) return `SET (length ${value.length})`
  return `SET (${value.length} chars, starts with "${value.slice(0, 4)}", ends with "${value.slice(-4)}")`
}

export async function GET() {
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
