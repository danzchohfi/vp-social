import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { production, productionComment, user as userTable } from "@/lib/db/schema"
import { asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userHasClientAccess } from "@/lib/active-client"
import { generateId } from "@/lib/utils"

async function loadAndAuthorize(userId: string, productionId: string) {
  const [prod] = await db.select().from(production).where(eq(production.id, productionId))
  if (!prod) return { error: "Produção não encontrada" as const, status: 404 as const }
  const ok = await userHasClientAccess(userId, prod.clientId)
  if (!ok) return { error: "Sem acesso" as const, status: 403 as const }
  return { prod }
}

// GET — list comments newest-last (chronological). Joins user for the
// authorName fallback when authorUserId is set.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const result = await loadAndAuthorize(session.user.id, id)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const rows = await db
    .select({
      id: productionComment.id,
      body: productionComment.body,
      resolved: productionComment.resolved,
      createdAt: productionComment.createdAt,
      authorUserId: productionComment.authorUserId,
      authorName: productionComment.authorName,
      // User join — falls back to comment.authorName when authorUserId is null
      // (client comments via /approve/[token]).
      userName: userTable.name,
      userImage: userTable.image,
    })
    .from(productionComment)
    .leftJoin(userTable, eq(userTable.id, productionComment.authorUserId))
    .where(eq(productionComment.productionId, id))
    .orderBy(asc(productionComment.createdAt))

  return NextResponse.json({
    comments: rows.map((r) => ({
      id: r.id,
      body: r.body,
      resolved: r.resolved,
      createdAt: r.createdAt,
      authorName: r.userName ?? r.authorName ?? "Anônimo",
      authorImage: r.userImage,
      // True when the comment came from a client via /approve/[token]
      // (no signed-in user, just the approval token).
      isClient: !r.authorUserId,
    })),
  })
}

// POST — agency-side comment. body { body: string, resolved?: boolean }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const result = await loadAndAuthorize(session.user.id, id)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const body = (await req.json().catch(() => null)) as { body?: string } | null
  if (!body || typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "body obrigatório" }, { status: 400 })
  }

  const newId = generateId()
  await db.insert(productionComment).values({
    id: newId,
    productionId: id,
    authorUserId: session.user.id,
    authorName: null,
    body: body.body.trim(),
  })

  return NextResponse.json({ id: newId, ok: true }, { status: 201 })
}

// PATCH /api/productions/[id]/comments — toggle resolved
// Expects body { commentId: string, resolved: boolean }. Cheaper than a
// /comments/[commentId] route and good enough for v1.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const result = await loadAndAuthorize(session.user.id, id)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const body = (await req.json().catch(() => null)) as { commentId?: string; resolved?: boolean } | null
  if (!body || typeof body.commentId !== "string" || typeof body.resolved !== "boolean") {
    return NextResponse.json({ error: "commentId + resolved obrigatórios" }, { status: 400 })
  }

  await db
    .update(productionComment)
    .set({ resolved: body.resolved })
    .where(eq(productionComment.id, body.commentId))

  return NextResponse.json({ ok: true })
}
