import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { tasks } from "@trigger.dev/sdk/v3"
import type { publishForUser } from "@/trigger/publish"

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const handle = await tasks.trigger<typeof publishForUser>("publish-for-user", {
    userId: session.user.id,
  })

  return NextResponse.json({ triggered: true, id: handle.id })
}
