import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

export async function PATCH(req: Request) {
  const hdrs = await headers()
  const session = await auth.api.getSession({ headers: hdrs })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  const { name, email, currentPassword, newPassword } = body as Record<string, unknown>

  if (typeof name === "string" && name.trim() && name.trim() !== session.user.name) {
    await db
      .update(user)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(eq(user.id, session.user.id))
  }

  if (typeof email === "string" && email.trim() && email.trim().toLowerCase() !== session.user.email.toLowerCase()) {
    try {
      await auth.api.changeEmail({
        body: { newEmail: email.trim().toLowerCase() },
        headers: hdrs,
      })
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message ?? "Erro ao trocar email" },
        { status: 400 }
      )
    }
  }

  if (typeof newPassword === "string" && newPassword.length >= 8) {
    if (typeof currentPassword !== "string" || !currentPassword) {
      return NextResponse.json({ error: "Senha atual obrigatória" }, { status: 400 })
    }
    try {
      await auth.api.changePassword({
        body: { currentPassword, newPassword },
        headers: hdrs,
      })
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message ?? "Erro ao trocar senha" },
        { status: 400 }
      )
    }
  } else if (typeof newPassword === "string" && newPassword.length > 0 && newPassword.length < 8) {
    return NextResponse.json({ error: "Senha deve ter ao menos 8 caracteres" }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
