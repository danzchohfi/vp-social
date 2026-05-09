import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { sendApprovalRequest, validatePhoneE164 } from "@/lib/manychat"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://posts.vitaminapublicitaria.com.br"

// Dry-run dispatch — sends the client's configured ManyChat Flow to a
// phone number the agency picks (typically their own). Confirms the
// whole pipeline works (token valid, flow exists, custom fields wired,
// WhatsApp template approved) without spamming the real client.
//
// Body: { phone: string, name?: string }
// Uses the saved client.manychatApiKey + manychatApprovalFlowNs.
// approval_url points at /test-approval (a static landing page) so the
// recipient sees "Funcionou — isso é o que seu cliente vai receber" instead
// of a broken token.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const isOwner = await userIsClientOwner(session.user.id, id)
  if (!isOwner) {
    return NextResponse.json({ error: "Apenas o owner pode disparar testes" }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { phone?: unknown; name?: unknown } | null
  const phone = typeof body?.phone === "string" ? body.phone.trim() : ""
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : (session.user.name || "Você")
  if (!phone) {
    return NextResponse.json({ error: "Telefone obrigatório (em formato E.164, ex: +5511999999999)" }, { status: 400 })
  }
  const v = validatePhoneE164(phone)
  if (!v.valid) {
    return NextResponse.json({ error: `Telefone inválido: ${v.reason}` }, { status: 400 })
  }

  const [row] = await db
    .select({
      name: client.name,
      manychatApiKey: client.manychatApiKey,
      manychatApprovalFlowNs: client.manychatApprovalFlowNs,
    })
    .from(client)
    .where(eq(client.id, id))
  if (!row) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
  if (!row.manychatApiKey || !row.manychatApprovalFlowNs) {
    return NextResponse.json({
      error: "ManyChat não configurado pra este cliente. Cole a API key e escolha um Flow primeiro.",
    }, { status: 400 })
  }

  const result = await sendApprovalRequest({
    apiKey: row.manychatApiKey,
    flowNs: row.manychatApprovalFlowNs,
    phone,
    customFields: {
      // Distinguishable test marker so the agency can see "[TESTE]" in the
      // WhatsApp template if they branch on this. Falls back gracefully
      // if the ManyChat flow ignores the field.
      approval_url: `${APP_URL}/test-approval`,
      post_title: `[TESTE] Configuração de aprovação — ${row.name}`,
      contact_name: name,
      post_url: "",
      is_test: "true",
    },
  })

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      reason: result.reason,
      hint: result.reason.includes("not found") || result.reason.toLowerCase().includes("subscriber")
        ? `O ManyChat não encontrou um subscriber com o telefone ${phone}. Solução: pelo menos uma vez, mande qualquer mensagem do seu WhatsApp pra página do ManyChat — isso registra você como subscriber. Depois tente o teste de novo.`
        : null,
    }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
