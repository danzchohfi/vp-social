import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { client } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { userIsClientOwner } from "@/lib/active-client"
import { validatePhoneE164 } from "@/lib/manychat"
import { dispatchApprovalRequest } from "@/lib/whatsapp-dispatch"

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
      whatsappProvider: client.whatsappProvider,
      manychatApiKey: client.manychatApiKey,
      manychatApprovalFlowNs: client.manychatApprovalFlowNs,
      metaWaToken: client.metaWaToken,
      metaPhoneNumberId: client.metaPhoneNumberId,
      metaTemplateName: client.metaTemplateName,
      metaTemplateLanguage: client.metaTemplateLanguage,
    })
    .from(client)
    .where(eq(client.id, id))
  if (!row) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

  const result = await dispatchApprovalRequest({
    client: {
      whatsappProvider: row.whatsappProvider,
      manychatApiKey: row.manychatApiKey,
      manychatApprovalFlowNs: row.manychatApprovalFlowNs,
      metaWaToken: row.metaWaToken,
      metaPhoneNumberId: row.metaPhoneNumberId,
      metaTemplateName: row.metaTemplateName,
      metaTemplateLanguage: row.metaTemplateLanguage,
    },
    phone,
    contactName: name,
    postTitle: `[TESTE] Configuração de aprovação — ${row.name}`,
    approvalUrl: `${APP_URL}/test-approval`,
  })

  if (!result.ok) {
    // Map common failure modes to a concrete next-step suggestion.
    // explainMetaError in lib/whatsapp-meta.ts already returns a
    // Portuguese explanation embedded in result.reason for Meta
    // errors — surface that verbatim. For ManyChat errors add the
    // subscriber-onboarding hint the agency keeps hitting.
    let hint: string | null = null
    const reasonLower = result.reason.toLowerCase()
    if (row.whatsappProvider === "meta_cloud") {
      if (reasonLower.includes("template not found") || result.reason.includes("132000")) {
        hint = `Confira o NOME do template em /settings: cópia EXATA do que está em Meta Business Manager → WhatsApp Manager → Templates aprovados (case-sensitive, sem espaços extras).`
      } else if (reasonLower.includes("language")) {
        hint = `Idioma do template em /settings não bate com o que você gravou na Meta. Olhe o template aprovado e confira o código (pt_BR, en_US etc).`
      } else if (reasonLower.includes("not in allowed list") || reasonLower.includes("permitted phone")) {
        hint = `Seu número não está na lista de telefones de teste do app Meta. Adicione em Meta App → WhatsApp → API Setup → "To" → Manage phone number list, verifique via SMS, e tente de novo.`
      } else if (result.reason.includes("code 190")) {
        hint = `Token expirou ou foi revogado. Gere um novo System User token (Expiration: Never) e cole em /settings.`
      } else if (result.reason.includes("code 200") || reasonLower.includes("necessary permissions")) {
        hint = `O System User tem acesso à WABA mas falta a permissão de envio. Vá em Meta Business Settings → Usuários do sistema → seu System User → Atribuir ativos → Contas do WhatsApp → marque "Enviar mensagens" (além de "Gerenciar conta"). Depois GERE UM NOVO TOKEN (tokens antigos não pegam permissões novas) e cole em /settings.`
      } else if (result.reason.includes("code 100") && result.reason.includes("subcode 33")) {
        hint = `O phone_number_id em /settings não bate com o número que o token consegue acessar. Confira em Meta for Developers → seu app → WhatsApp → API Setup: o dropdown "De" mostra o número, e logo abaixo aparece "Identificação do número de telefone" — esse é o ID que vai em /settings.`
      }
    } else if (result.reason.includes("not found") || reasonLower.includes("subscriber")) {
      hint = `O ManyChat não encontrou um subscriber com o telefone ${phone}. Solução: pelo menos uma vez, mande qualquer mensagem do seu WhatsApp pra página do ManyChat — isso registra você como subscriber. Depois tente o teste de novo.`
    }

    return NextResponse.json({
      ok: false,
      reason: result.reason,
      hint,
    }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
