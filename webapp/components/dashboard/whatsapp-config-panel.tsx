"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, Loader2, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { MetaSetupGuide } from "@/components/setup-guides/meta-setup-guide"

// Agency-level WhatsApp config (one WABA per user). All clients of the
// same owner share this — set token + phone_number_id + template once,
// every client's auto-dispatch uses it. To opt a specific client out,
// switch its approval mode to "Manual por post" in ApprovalPanel.
export function WhatsappConfigPanel() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [token, setToken] = useState("")
  const [origToken, setOrigToken] = useState("")
  const [phoneId, setPhoneId] = useState("")
  const [origPhoneId, setOrigPhoneId] = useState("")
  const [templateName, setTemplateName] = useState("")
  const [origTemplateName, setOrigTemplateName] = useState("")
  const [templateLanguage, setTemplateLanguage] = useState("pt_BR")
  const [origTemplateLanguage, setOrigTemplateLanguage] = useState("pt_BR")

  const [validating, setValidating] = useState(false)
  const [validateResult, setValidateResult] = useState<any>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnoseResult, setDiagnoseResult] = useState<any>(null)

  const [pin, setPin] = useState("")
  const [registering, setRegistering] = useState(false)
  const [registerResult, setRegisterResult] = useState<any>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/me/whatsapp-config")
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao carregar config")
        return
      }
      setToken(data.metaWaToken ?? "")
      setOrigToken(data.metaWaToken ?? "")
      setPhoneId(data.metaPhoneNumberId ?? "")
      setOrigPhoneId(data.metaPhoneNumberId ?? "")
      setTemplateName(data.metaTemplateName ?? "")
      setOrigTemplateName(data.metaTemplateName ?? "")
      setTemplateLanguage(data.metaTemplateLanguage ?? "pt_BR")
      setOrigTemplateLanguage(data.metaTemplateLanguage ?? "pt_BR")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const dirty =
    token.trim() !== origToken ||
    phoneId.trim() !== origPhoneId ||
    templateName.trim() !== origTemplateName ||
    templateLanguage.trim() !== origTemplateLanguage

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/me/whatsapp-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metaWaToken: token.trim(),
          metaPhoneNumberId: phoneId.trim(),
          metaTemplateName: templateName.trim(),
          metaTemplateLanguage: templateLanguage.trim() || "pt_BR",
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Erro ao salvar")
      }
      toast.success("WhatsApp da agência salvo")
      setOrigToken(token.trim())
      setOrigPhoneId(phoneId.trim())
      setOrigTemplateName(templateName.trim())
      setOrigTemplateLanguage(templateLanguage.trim() || "pt_BR")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSaving(false)
    }
  }

  async function validate() {
    if (!token.trim() || !phoneId.trim()) {
      toast.error("Cole token e Phone Number ID primeiro")
      return
    }
    setValidating(true)
    setValidateResult(null)
    setDiagnoseResult(null)
    try {
      const res = await fetch("/api/me/meta-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), phoneNumberId: phoneId.trim() }),
      })
      setValidateResult(await res.json())
    } catch (e) {
      setValidateResult({ ok: false, reason: e instanceof Error ? e.message : String(e) })
    } finally {
      setValidating(false)
    }
  }

  async function diagnose() {
    setDiagnosing(true)
    setValidateResult(null)
    setDiagnoseResult(null)
    try {
      const res = await fetch("/api/me/meta-diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() || undefined, phoneNumberId: phoneId.trim() || undefined }),
      })
      setDiagnoseResult(await res.json())
    } catch (e) {
      setDiagnoseResult({ ok: false, summary: e instanceof Error ? e.message : String(e) })
    } finally {
      setDiagnosing(false)
    }
  }

  async function registerPhone() {
    if (!/^\d{6}$/.test(pin.trim())) {
      toast.error("PIN deve ter exatamente 6 dígitos")
      return
    }
    if (dirty) {
      toast.error("Salve o token e Phone Number ID primeiro")
      return
    }
    setRegistering(true)
    setRegisterResult(null)
    try {
      const res = await fetch("/api/me/meta-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      })
      const data = await res.json()
      setRegisterResult(data)
      if (data.ok) {
        toast.success("Número registrado no Cloud API ✓")
        setPin("")
      }
    } catch (e) {
      setRegisterResult({ ok: false, reason: e instanceof Error ? e.message : String(e) })
    } finally {
      setRegistering(false)
    }
  }

  const hasCredentials = !!origToken && !!origPhoneId && !!origTemplateName

  return (
    <div className="space-y-4">
      <div>
        <p className="text-base font-semibold">WhatsApp da agência</p>
        <p className="text-sm text-muted-foreground">
          Uma WABA central pra todos os seus clientes. Configure aqui uma vez e cada cliente que estiver em modo &quot;automático&quot; dispara aprovações por esse número. Pra cliente específico não usar Meta Cloud, troca o modo dele pra &quot;Manual por post&quot; em <em>/settings → Aprovação do cliente</em>.
        </p>
      </div>

      <MetaSetupGuide hasCredentials={hasCredentials} />

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-sm">Token da API (System User permanente)</Label>
            <p className="text-sm text-muted-foreground">
              Meta Business Settings → Users → System Users. Crie um System User com permissões <em>whatsapp_business_messaging</em> e <em>whatsapp_business_management</em>, gere um <strong>token permanente</strong> (NÃO o token temporário de 24h em API Setup).
            </p>
            <Input
              type="password"
              placeholder="EAAxxxxx..."
              value={token}
              onChange={(e) => { setToken(e.target.value); setValidateResult(null); setDiagnoseResult(null) }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Phone Number ID</Label>
            <p className="text-sm text-muted-foreground">
              ID numérico do número WhatsApp Business em Meta App → WhatsApp → API Setup. NÃO é o telefone — é o ID interno.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="123456789012345"
                value={phoneId}
                onChange={(e) => { setPhoneId(e.target.value); setValidateResult(null); setDiagnoseResult(null) }}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={validate} disabled={validating || diagnosing || !token.trim() || !phoneId.trim()}>
                {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Validar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={diagnose}
                disabled={validating || diagnosing || !token.trim() || !phoneId.trim()}
                title="Introspecciona o token e checa se o phone_number_id pertence a uma WABA que o token pode usar. Use quando 'Validar' passa mas o envio dá code 200."
              >
                {diagnosing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Diagnosticar
              </Button>
            </div>
            {validateResult && (
              <div className={cn(
                "rounded border px-2 py-1.5 text-sm",
                validateResult.ok
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              )}>
                {validateResult.ok ? (
                  <span>
                    ✓ Credenciais OK — número <strong>{validateResult.displayPhoneNumber}</strong>
                    {validateResult.verifiedName ? ` (${validateResult.verifiedName})` : ""}
                  </span>
                ) : (
                  <span>Falhou: {validateResult.reason}</span>
                )}
              </div>
            )}
            {diagnoseResult && <MetaDiagnoseResult result={diagnoseResult} />}
          </div>

          <div className="space-y-1.5 rounded-md border bg-muted/20 p-3">
            <Label className="text-sm">Registrar número no Cloud API <span className="font-normal text-muted-foreground">(uma vez por número)</span></Label>
            <p className="text-sm text-muted-foreground">
              Antes do primeiro envio, o número precisa de um POST <code className="font-mono">/register</code>. Escolha um PIN de 6 dígitos (vira o 2FA da WABA — anota ele) e clique Registrar. Usa o token + Phone Number ID salvos. Se já registrou antes, use o PIN existente.
            </p>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="123456"
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setRegisterResult(null) }}
                className="flex-1 font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={registerPhone}
                disabled={registering || dirty || !/^\d{6}$/.test(pin)}
                title={dirty ? "Salve antes de registrar" : "POST /v18.0/{phone_number_id}/register"}
              >
                {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Registrar
              </Button>
            </div>
            {registerResult && (
              <div className={cn(
                "rounded border px-2 py-1.5 text-sm",
                registerResult.ok
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              )}>
                {registerResult.ok
                  ? <>✓ Número registrado no Cloud API — pode testar &quot;Enviar pra mim&quot; agora.</>
                  : <>Falhou: {registerResult.reason}</>}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-1.5">
              <Label className="text-sm">Template aprovado pela Meta</Label>
              <p className="text-sm text-muted-foreground">
                Nome EXATO do template aprovado em Meta Business Manager → WhatsApp Manager → Modelos. Categoria <strong>Utilidade</strong>. Corpo precisa ter 3 variáveis: {"{{1}}"} contato, {"{{2}}"} título do post, {"{{3}}"} link de aprovação.
              </p>
              <Input
                placeholder="approval_request"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Idioma</Label>
              <p className="text-sm text-muted-foreground">Código do template (ex: pt_BR).</p>
              <Input
                placeholder="pt_BR"
                value={templateLanguage}
                onChange={(e) => setTemplateLanguage(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={save} disabled={saving || !dirty} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar
          </Button>

          {!dirty && hasCredentials && <SelfTestPanel />}
        </>
      )}
    </div>
  )
}

// Dispara um envio de teste pro próprio WhatsApp do usuário — confirma
// que token + phone + template estão todos OK antes de mandar pra clientes.
function SelfTestPanel() {
  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; reason?: string; hint?: string | null } | null>(null)
  const [open, setOpen] = useState(false)

  async function send() {
    if (!phone.trim()) {
      toast.error("Cole seu telefone")
      return
    }
    setSending(true)
    setResult(null)
    try {
      const res = await fetch("/api/me/test-approval-self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), name: name.trim() || undefined }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const reason = data?.reason ?? data?.error ?? `HTTP ${res.status}: sem detalhe`
        setResult({ ok: false, reason, hint: data?.hint ?? null })
        return
      }
      if (data && data.ok === false) {
        setResult({ ok: false, reason: data.reason ?? "Falha no dispatch", hint: data.hint ?? null })
        return
      }
      setResult({ ok: true })
      toast.success("Mensagem enviada — confira seu WhatsApp")
    } catch (e) {
      setResult({ ok: false, reason: e instanceof Error ? e.message : String(e) })
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Testar com meu próprio WhatsApp
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-base font-semibold">Testar com seu WhatsApp</p>
        <button
          type="button"
          onClick={() => { setOpen(false); setResult(null) }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Fechar
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Dispara o template Meta-aprovado pra você (em vez do cliente real) com um post de teste. Confirma que token + phone + template estão todos OK.
      </p>
      <div className="space-y-1.5">
        <Label className="text-sm">Seu telefone (E.164)</Label>
        <Input
          type="tel"
          placeholder="+5511999999999"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="font-mono text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm">Seu nome (vai aparecer como contact_name)</Label>
        <Input
          type="text"
          placeholder="Vai usar o nome da sua conta se ficar em branco"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={send} disabled={sending || !phone.trim()}>
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
        Enviar pra mim
      </Button>
      {result && (
        <div
          className={cn(
            "rounded border px-2 py-1.5 text-sm",
            result.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {result.ok ? (
            <span>✓ Enviado. Verifique seu WhatsApp em alguns segundos.</span>
          ) : (
            <div className="space-y-1">
              <p className="font-medium">{result.reason}</p>
              {result.hint && <p className="text-foreground/80">{result.hint}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Renders the structured diagnosis returned by /api/me/meta-diagnose.
// Three rows (token / phone / match), each with a ✓ or ✗, plus a top
// summary line. The agency reads it across the room to see which gate
// failed and what to fix.
type DiagnoseResult = {
  ok?: boolean
  summary?: string
  token?: {
    ok: boolean
    appId: string | null
    expiresLabel: string
    scopes: string[]
    hasMessagingScope: boolean
    hasManagementScope: boolean
    messagingTargetWabaIds: string[]
    reason: string | null
  }
  phone?: {
    ok: boolean
    displayPhoneNumber: string | null
    verifiedName: string | null
    wabaId: string | null
    isMetaTestNumber: boolean
    reason: string | null
  }
  match?: {
    ok: boolean | null
    reason: string
  }
}

function MetaDiagnoseResult({ result }: { result: DiagnoseResult }) {
  if (!result?.token && !result?.phone) {
    return (
      <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-sm text-destructive">
        {result?.summary ?? "Diagnóstico falhou"}
      </div>
    )
  }
  const t = result.token
  const p = result.phone
  const m = result.match
  const topClass = result.ok
    ? "border-success/30 bg-success/10 text-success"
    : "border-destructive/30 bg-destructive/10 text-destructive"
  return (
    <div className="space-y-1.5">
      <div className={cn("rounded border px-2 py-1.5 text-sm font-medium", topClass)}>
        {result.ok ? "✓ " : "✗ "}{result.summary}
      </div>
      <div className="rounded border bg-muted/30 px-2 py-1.5 text-[13px] text-foreground/90 space-y-1">
        <DiagnoseRow ok={t?.ok ?? false}>
          <strong>Token</strong>
          {t?.appId && <> · app <code className="font-mono">{t.appId}</code></>}
          {t?.expiresLabel && <> · {t.expiresLabel}</>}
          <div className="mt-0.5 text-muted-foreground">
            scopes: {t?.scopes?.length ? t.scopes.join(", ") : "(nenhum)"}
          </div>
          {t && !t.hasMessagingScope && (
            <div className="text-destructive">falta whatsapp_business_messaging — gere novo token marcando essa checkbox</div>
          )}
          {t && t.hasMessagingScope && (
            <div className="text-muted-foreground">
              WABAs do token: {t.messagingTargetWabaIds.length > 0
                ? t.messagingTargetWabaIds.map((id) => <code key={id} className="ml-1 font-mono">{id}</code>)
                : <span className="text-destructive">(nenhuma — atribua a WABA ao System User e gere novo token)</span>}
            </div>
          )}
          {t?.reason && !t.ok && <div className="text-destructive">{t.reason}</div>}
        </DiagnoseRow>

        <DiagnoseRow ok={p?.ok ?? false}>
          <strong>Phone Number ID</strong>
          {p?.displayPhoneNumber && <> · {p.displayPhoneNumber}</>}
          {p?.verifiedName && <> ({p.verifiedName})</>}
          {p?.wabaId && (
            <div className="mt-0.5 text-muted-foreground">
              WABA do número: <code className="font-mono">{p.wabaId}</code>
            </div>
          )}
          {p?.isMetaTestNumber && (
            <div className="text-warning">
              ⚠ Este é o NÚMERO DE TESTE da Meta (+1 555…) — pertence à WABA da Meta, não à sua. Use o ID do seu número real.
            </div>
          )}
          {p?.reason && !p.ok && <div className="text-destructive">{p.reason}</div>}
        </DiagnoseRow>

        <DiagnoseRow ok={m?.ok === true}>
          <strong>WABA do número ↔ WABAs do token</strong>
          <div className={cn("mt-0.5", m?.ok === false ? "text-destructive" : "text-muted-foreground")}>
            {m?.reason ?? "—"}
          </div>
        </DiagnoseRow>
      </div>
    </div>
  )
}

function DiagnoseRow({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className={cn("mt-0.5 shrink-0", ok ? "text-success" : "text-destructive")}>
        {ok ? "✓" : "✗"}
      </span>
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  )
}
