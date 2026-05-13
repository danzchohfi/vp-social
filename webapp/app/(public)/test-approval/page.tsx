// Landing page for the "Testar com meu WhatsApp" dry-run dispatch
// (POST /api/me/test-approval-self). The Meta Cloud template uses
// {{approval_url}} = ${APP_URL}/test-approval so when the recipient
// taps the link in WhatsApp they don't hit a 404 — instead they see a
// friendly "this is what your client will see" preview that mirrors
// the look-and-feel of /approve/[token] without any side effects.

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, MessageCircle } from "lucide-react"

export default function TestApprovalLanding() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 py-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl">Funcionou!</h1>
            <p className="mt-1 text-base text-muted-foreground">
              Esse é exatamente o link que seu cliente vai receber pelo WhatsApp quando um post entrar em &quot;aguardando aprovação&quot;.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4 text-left text-sm">
            <p className="font-medium">Como funciona pro cliente</p>
            <ul className="mt-1.5 space-y-1 text-muted-foreground">
              <li>· Cliente clica no link → vê uma página com o post completo (mídia, legenda, plataformas)</li>
              <li>· Botões: <strong>Aprovar</strong> (1 clique, sem login) ou <strong>Pedir alterações</strong> (com comentário)</li>
              <li>· Decidiu? O Notion atualiza automaticamente, e você recebe um email avisando</li>
            </ul>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/dashboard">
                <MessageCircle className="h-4 w-4" />
                Voltar pro VP Social
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
