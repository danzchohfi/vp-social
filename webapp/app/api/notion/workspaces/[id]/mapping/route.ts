import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { fieldMapping, notionConnection } from "@/lib/db/schema"
import { generateId } from "@/lib/utils"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

function dbToUi(row: any) {
  return {
    statusField: row.statusField ?? "",
    statusReadyValue: row.statusReadyValue ?? "",
    statusPublishedValue: row.statusPublishedValue ?? "",
    statusErrorValue: row.statusErrorValue ?? "",
    titleField: row.titleField ?? "Produção",
    dateField: row.dateField ?? "",
    captionField: row.captionField ?? "",
    publicarEmField: row.publicarEmField ?? "",
    accountField: row.accountField ?? "",
    feedImageUrlsField: row.mediaFeedField ?? "",
    verticalUrlsField: row.mediaVerticalField ?? "",
    horizontalUrlsField: row.mediaHorizontalField ?? "",
    thumbnailUrlField: row.thumbnailField ?? "",
    likesField: row.likesField ?? "",
    commentsField: row.commentsField ?? "",
    reachField: row.reachField ?? "",
    savesField: row.savesField ?? "",
    impressionsField: row.impressionsField ?? "",
    postUrlField: row.postUrlField ?? "",
    // Approval flow — opt-in; null in DB = empty string in UI.
    awaitingApprovalValue: row.awaitingApprovalValue ?? "",
    revisionRequestedValue: row.revisionRequestedValue ?? "",
    clientContactField: row.clientContactField ?? "",
    contactEmailField: row.contactEmailField ?? "",
    contactPhoneField: row.contactPhoneField ?? "",
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: connectionId } = await params

  const [row] = await db
    .select()
    .from(fieldMapping)
    .where(
      and(
        eq(fieldMapping.connectionId, connectionId),
        eq(fieldMapping.userId, session.user.id)
      )
    )

  return NextResponse.json(row ? dbToUi(row) : {})
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: connectionId } = await params
  const ui = await req.json()

  const dbFields = {
    statusField: ui.statusField,
    statusReadyValue: ui.statusReadyValue,
    statusPublishedValue: ui.statusPublishedValue,
    statusErrorValue: ui.statusErrorValue,
    titleField: ui.titleField || "Produção",
    dateField: ui.dateField,
    captionField: ui.captionField,
    publicarEmField: ui.publicarEmField,
    accountField: ui.accountField,
    mediaFeedField: ui.feedImageUrlsField,
    mediaVerticalField: ui.verticalUrlsField,
    mediaHorizontalField: ui.horizontalUrlsField,
    thumbnailField: ui.thumbnailUrlField,
    likesField: ui.likesField || null,
    commentsField: ui.commentsField || null,
    reachField: ui.reachField || null,
    savesField: ui.savesField || null,
    impressionsField: ui.impressionsField || null,
    postUrlField: ui.postUrlField || null,
    awaitingApprovalValue: ui.awaitingApprovalValue || null,
    revisionRequestedValue: ui.revisionRequestedValue || null,
    clientContactField: ui.clientContactField || null,
    contactEmailField: ui.contactEmailField || null,
    contactPhoneField: ui.contactPhoneField || null,
    updatedAt: new Date(),
  }

  try {
    await db
      .insert(fieldMapping)
      .values({
        id: generateId(),
        userId: session.user.id,
        connectionId,
        ...dbFields,
      })
      .onConflictDoUpdate({
        target: fieldMapping.connectionId,
        set: dbFields,
      })

    return NextResponse.json({ ok: true })
  } catch (e) {
    // Surface the actual DB error to the client so the user knows WHY the
    // save failed (most common: a notNull column got "" because the user
    // picked "— Não usar —" on a required field).
    console.error("Mapping save error:", e)
    const message = e instanceof Error ? e.message : "Falha ao salvar mapeamento"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
