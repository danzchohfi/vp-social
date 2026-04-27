import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notionConnection } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [connection] = await db
    .select()
    .from(notionConnection)
    .where(eq(notionConnection.userId, session.user.id))

  return NextResponse.json({ connection: connection ?? null })
}
