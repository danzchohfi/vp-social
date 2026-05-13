import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { userWhatsappConfig } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

// GET — returns the signed-in user's WhatsApp config (agency-level).
// Lazy-creates the row on first read so the caller doesn't have to
// handle "missing row" as a separate case.
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [row] = await db
    .select()
    .from(userWhatsappConfig)
    .where(eq(userWhatsappConfig.userId, session.user.id))

  return NextResponse.json({
    metaWaToken: row?.metaWaToken ?? "",
    metaPhoneNumberId: row?.metaPhoneNumberId ?? "",
    metaTemplateName: row?.metaTemplateName ?? "",
    metaTemplateLanguage: row?.metaTemplateLanguage ?? "pt_BR",
    configured: !!row?.metaWaToken && !!row?.metaPhoneNumberId && !!row?.metaTemplateName,
  })
}

// PUT — upserts the config. Empty strings clear the field (so the
// dispatcher's "not configured" check fires cleanly).
export async function PUT(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    metaWaToken?: unknown
    metaPhoneNumberId?: unknown
    metaTemplateName?: unknown
    metaTemplateLanguage?: unknown
  } | null

  const clean = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null

  const metaWaToken = clean(body?.metaWaToken)
  const metaPhoneNumberId = clean(body?.metaPhoneNumberId)
  const metaTemplateName = clean(body?.metaTemplateName)
  const metaTemplateLanguage = clean(body?.metaTemplateLanguage) ?? "pt_BR"

  await db
    .insert(userWhatsappConfig)
    .values({
      userId: session.user.id,
      metaWaToken,
      metaPhoneNumberId,
      metaTemplateName,
      metaTemplateLanguage,
    })
    .onConflictDoUpdate({
      target: userWhatsappConfig.userId,
      set: {
        metaWaToken,
        metaPhoneNumberId,
        metaTemplateName,
        metaTemplateLanguage,
        updatedAt: sql`now()`,
      },
    })

  return NextResponse.json({ ok: true })
}
