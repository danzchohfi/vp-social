import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { fieldMapping, notionConnection } from "@/lib/db/schema"
import { generateId } from "@/lib/utils"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

// Copy a fieldMapping row from one connection (source) to another (target).
// Both connections must belong to the calling user — we don't allow cloning
// across users even if the IDs are guessable. Status values are intentionally
// included since they're more about Notion DB conventions than per-client.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const { id: targetConnectionId } = await params
  const { sourceConnectionId } = await req.json()
  if (!sourceConnectionId) {
    return NextResponse.json({ error: "sourceConnectionId obrigatório" }, { status: 400 })
  }
  if (sourceConnectionId === targetConnectionId) {
    return NextResponse.json({ error: "Origem e destino são a mesma conexão" }, { status: 400 })
  }

  const [source, target] = await Promise.all([
    db
      .select()
      .from(notionConnection)
      .where(and(eq(notionConnection.id, sourceConnectionId), eq(notionConnection.userId, userId)))
      .then((r) => r[0]),
    db
      .select()
      .from(notionConnection)
      .where(and(eq(notionConnection.id, targetConnectionId), eq(notionConnection.userId, userId)))
      .then((r) => r[0]),
  ])

  if (!source) return NextResponse.json({ error: "Conexão de origem não encontrada" }, { status: 404 })
  if (!target) return NextResponse.json({ error: "Conexão de destino não encontrada" }, { status: 404 })

  const [sourceMapping] = await db
    .select()
    .from(fieldMapping)
    .where(eq(fieldMapping.connectionId, sourceConnectionId))

  if (!sourceMapping) {
    return NextResponse.json({ error: "Workspace de origem ainda não tem mapeamento salvo" }, { status: 400 })
  }

  // Pick the columns we want to clone — skip id/connectionId/userId/timestamps,
  // those are about row identity, not config.
  const cloned = {
    statusField: sourceMapping.statusField,
    statusReadyValue: sourceMapping.statusReadyValue,
    statusPublishedValue: sourceMapping.statusPublishedValue,
    statusErrorValue: sourceMapping.statusErrorValue,
    titleField: sourceMapping.titleField,
    dateField: sourceMapping.dateField,
    captionField: sourceMapping.captionField,
    publicarEmField: sourceMapping.publicarEmField,
    accountField: sourceMapping.accountField,
    mediaFeedField: sourceMapping.mediaFeedField,
    mediaVerticalField: sourceMapping.mediaVerticalField,
    mediaHorizontalField: sourceMapping.mediaHorizontalField,
    thumbnailField: sourceMapping.thumbnailField,
    likesField: sourceMapping.likesField,
    commentsField: sourceMapping.commentsField,
    reachField: sourceMapping.reachField,
    savesField: sourceMapping.savesField,
    impressionsField: sourceMapping.impressionsField,
    postUrlField: sourceMapping.postUrlField,
    socialVpField: sourceMapping.socialVpField,
    updatedAt: new Date(),
  }

  await db
    .insert(fieldMapping)
    .values({
      id: generateId(),
      userId,
      connectionId: targetConnectionId,
      ...cloned,
    })
    .onConflictDoUpdate({
      target: fieldMapping.connectionId,
      set: cloned,
    })

  return NextResponse.json({ ok: true })
}
