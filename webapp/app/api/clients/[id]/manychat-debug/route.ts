import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client as clientTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"

const MANYCHAT_BASE = "https://api.manychat.com"

// Diagnose the client's ManyChat connection end-to-end. Used when
// findByPhone returns 404 and the agency insists the contact exists.
// Three checks:
//   1. /fb/page/getInfo — confirms the API key works + names the page
//      we're connected to. Lets the agency verify it's the right
//      ManyChat account.
//   2. Multiple phone-format probes against wa/findByPhone — including
//      without country code, with leading zero, etc.
//   3. (optional, ?listSubscribers=1) — placeholder for future
//      enumerate-subscribers if ManyChat exposes one.
//
// Query: /api/clients/[id]/manychat-debug?phone=+5511944459535
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const ok = await userIsClientOwner(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Sem acesso" }, { status: 403 })

  const [c] = await db
    .select({
      manychatApiKey: clientTable.manychatApiKey,
      manychatApprovalFlowNs: clientTable.manychatApprovalFlowNs,
    })
    .from(clientTable)
    .where(eq(clientTable.id, id))
  if (!c?.manychatApiKey) {
    return NextResponse.json({ error: "ManyChat API key não configurada pra este cliente" }, { status: 400 })
  }

  const url = new URL(req.url)
  const rawPhone = url.searchParams.get("phone")?.trim() ?? ""

  const trace: any = {}

  // Step 1: page info — proves auth + names the page.
  try {
    const res = await fetch(`${MANYCHAT_BASE}/fb/page/getInfo`, {
      method: "GET",
      headers: { Authorization: `Bearer ${c.manychatApiKey}` },
    })
    const data: any = await res.json().catch(() => null)
    trace.pageInfo = {
      status: res.status,
      ok: res.ok,
      name: data?.data?.name ?? null,
      id: data?.data?.id ?? null,
      timezone: data?.data?.timezone ?? null,
      raw: data,
    }
  } catch (e) {
    trace.pageInfo = { error: e instanceof Error ? e.message : String(e) }
  }

  // Step 2: try multiple phone variants if a phone was provided.
  if (rawPhone) {
    const digits = rawPhone.replace(/\D/g, "")
    const variants = Array.from(new Set([
      digits.startsWith("+") ? digits : `+${digits}`,
      digits,
      // Without country code (assume 2-digit country code prefix like
      // "55" for Brazil). Helps catch ManyChat imports that dropped it.
      digits.length > 11 ? digits.slice(2) : digits,
      // With "+" + without country code
      digits.length > 11 ? `+${digits.slice(2)}` : digits,
    ])).filter(Boolean)

    const attempts: Array<{ variant: string; status: number; body: any }> = []
    for (const v of variants) {
      try {
        const qs = new URLSearchParams({ phone: v })
        const res = await fetch(`${MANYCHAT_BASE}/wa/subscriber/findByPhone?${qs}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${c.manychatApiKey}` },
        })
        const body: any = await res.json().catch(() => null)
        attempts.push({ variant: v, status: res.status, body })
      } catch (e) {
        attempts.push({ variant: v, status: 0, body: { error: e instanceof Error ? e.message : String(e) } })
      }
    }
    trace.phoneProbes = attempts

    // Also try fb/findByName as a last-ditch — maybe the subscriber
    // exists on FB Messenger channel and the user is mistaking that
    // for WhatsApp. Searching by name needs a name, so skip if we
    // don't have one. (Future: pass name in query.)
  }

  trace.flowConfigured = !!c.manychatApprovalFlowNs
  trace.advice = (() => {
    if (!trace.pageInfo?.ok) {
      return "API key inválida ou expirou. Vá em ManyChat → Settings → API → gera nova key e cola em /settings → Aprovação cliente."
    }
    if (trace.phoneProbes?.every((p: any) => p.status === 404)) {
      const pageName = trace.pageInfo?.name ?? "(?)"
      return `Conta ManyChat confirmada: "${pageName}". Mas o telefone ${rawPhone} não existe como subscriber em NENHUM formato testado. Possíveis causas: (1) o subscriber está em OUTRA conta ManyChat (verifique se a API key é da página correta) ou (2) ele existe em outro canal (FB Messenger / Instagram) e não no WhatsApp dessa página.`
    }
    return null
  })()

  return NextResponse.json(trace)
}
