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
    dateField: row.dateField ?? "",
    captionField: row.captionField ?? "",
    hashtagsField: row.hashtagsField ?? "",
    tipoField: row.tipoField ?? "",
    plataformasField: row.plataformasField ?? "",
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
    dateField: ui.dateField,
    captionField: ui.captionField,
    hashtagsField: ui.hashtagsField,
    tipoField: ui.tipoField,
    plataformasField: ui.plataformasField,
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
    updatedAt: new Date(),
  }

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
}
