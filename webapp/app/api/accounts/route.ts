import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { instagramAccount } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const accounts = await db
    .select()
    .from(instagramAccount)
    .where(eq(instagramAccount.userId, session.user.id))

  return NextResponse.json(accounts)
}
