"use client"

import { useState } from "react"
import Link from "next/link"
import { PublicHeader } from "@/components/public/header"
import { PublicFooter } from "@/components/public/footer"

const CLIENT_COUNTS = [
  "1-3 clientes",
  "4-7 clientes",
  "8-15 clientes",
  "16-30 clientes",
  "30+ clientes",
  "Ainda não tenho clientes pagantes",
]

const PLANNING_TOOLS = [
  "Notion",
  "Google Sheets",
  "Trello",
  "Asana",
  "Airtable",
  "Outra ferramenta",
  "WhatsApp + planilha",
  "Não uso nada estruturado",
]

export default function DemoPage() {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const payload = {
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      agencyName: fd.get("agencyName"),
      clientCount: fd.get("clientCount"),
      planningTool: fd.get("planningTool"),
      comments: fd.get("comments"),
      source: typeof window !== "undefined" ? document.referrer || null : null,
    }
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || "Algo deu errado. Tenta de novo em alguns minutos.")
      } else {
        setDone(true)
      }
    } catch {
      setError("Sem conexão. Tenta de novo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.35] tech-grid"
        style={{ maskImage: "radial-gradient(ellipse at center, black 20%, transparent 75%)" }}
      />
      <PublicHeader />

      <main className="relative flex-1 px-8 py-[80px]">
        <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          {/* Left — pitch + signals */}
          <div>
            <span className="font-mono mb-4 inline-block text-[12px] uppercase tracking-[0.12em] text-primary">
              pedir demo
            </span>
            <h1 className="font-display mb-5 text-[clamp(40px,5.5vw,68px)] font-normal leading-[1.05] tracking-tight">
              30 minutos. <em className="italic text-primary">Sem slides.</em>
            </h1>
            <p className="mb-8 text-[18px] leading-[1.55] text-muted-foreground">
              Você abre a conta da sua agência, eu abro a minha tela.
              Conectamos um Notion seu de verdade, mostro o post saindo
              direto pra rede sem agendador no meio, e o painel que o seu
              cliente vai abrir. A gente vê se faz sentido.
            </p>

            <div className="space-y-4">
              <DemoBullet>
                <strong className="text-foreground">Tela compartilhada</strong> — sem deck.
                Se não rolar, você sai em 5 min.
              </DemoBullet>
              <DemoBullet>
                <strong className="text-foreground">14 dias de teste</strong> grátis depois,
                sem cartão.
              </DemoBullet>
              <DemoBullet>
                <strong className="text-foreground">Setup white-glove</strong> incluso —
                a gente conecta seu Notion + WhatsApp pra você.
              </DemoBullet>
              <DemoBullet>
                <strong className="text-foreground">Resposta em 24h</strong>{" "}
                <span className="font-mono text-primary">●</span>{" "}
                <span className="text-muted-foreground">durante semana</span>
              </DemoBullet>
            </div>

            <div className="font-mono mt-10 rounded-[14px] border border-border bg-card/40 p-5 text-[13px] backdrop-blur">
              <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-primary">
                Quem fala com você
              </div>
              <p className="text-muted-foreground">
                <span className="text-foreground">Daniel Chohfi</span>, fundador da
                Vitamina Publicitária — agência que opera com Produção desde 2024.
                Falo direto, não tem comercial intermediário.
              </p>
            </div>
          </div>

          {/* Right — form */}
          <div>
            <div className="rounded-[20px] border border-border bg-card p-8 md:p-10">
              {done ? (
                <DoneState />
              ) : (
                <form onSubmit={onSubmit} className="space-y-5">
                  <Field label="Nome" name="name" placeholder="Como você quer ser chamado" required />
                  <Field label="E-mail" name="email" type="email" placeholder="voce@suaagencia.com.br" required />
                  <Field label="WhatsApp" name="phone" type="tel" placeholder="+55 11 99999-0000" required />
                  <Field label="Nome da agência" name="agencyName" placeholder="Sua agência" />

                  <FieldSelect
                    label="Quantos clientes ativos?"
                    name="clientCount"
                    options={CLIENT_COUNTS}
                  />

                  <FieldSelect
                    label="Onde a agência planeja conteúdo hoje?"
                    name="planningTool"
                    options={PLANNING_TOOLS}
                  />

                  <div>
                    <label
                      htmlFor="comments"
                      className="mb-2 block text-[13px] font-medium"
                    >
                      Comentário <span className="text-muted-foreground">(opcional)</span>
                    </label>
                    <textarea
                      id="comments"
                      name="comments"
                      rows={3}
                      maxLength={1000}
                      placeholder="Conta um pouco do contexto da sua agência..."
                      className="w-full resize-none rounded-md border border-border bg-background px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-primary/60"
                    />
                  </div>

                  {error && (
                    <div className="font-mono rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-full bg-foreground px-6 py-[14px] text-[15px] font-medium text-background transition-colors hover:bg-primary disabled:opacity-50"
                  >
                    {loading ? "Enviando..." : "Pedir demo"}
                  </button>

                  <p className="font-mono text-center text-[11px] text-muted-foreground">
                    sem spam · seus dados ficam só conosco
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}

function Field({
  label, name, type = "text", placeholder, required = false,
}: {
  label: string; name: string; type?: string; placeholder?: string; required?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-[13px] font-medium">
        {label} {required && <span className="text-primary">*</span>}
      </label>
      <input
        type={type}
        id={name}
        name={name}
        placeholder={placeholder}
        required={required}
        autoComplete={
          type === "email" ? "email" : name === "phone" ? "tel" : name === "name" ? "name" : "off"
        }
        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-primary/60"
      />
    </div>
  )
}

function FieldSelect({
  label, name, options,
}: { label: string; name: string; options: string[] }) {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-[13px] font-medium">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue=""
        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-primary/60"
      >
        <option value="">Selecione...</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  )
}

function DemoBullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-[15px] leading-[1.55] text-muted-foreground">
      <span className="mt-[8px] block h-[5px] w-[5px] shrink-0 rounded-full bg-primary" />
      <span>{children}</span>
    </div>
  )
}

function DoneState() {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-[24px] text-primary">
        ✓
      </div>
      <h2 className="font-display mb-3 text-[28px] font-normal leading-tight">
        Recebido. <em className="italic text-primary">Te respondo em até 24h.</em>
      </h2>
      <p className="mb-6 text-[15px] text-muted-foreground">
        Enquanto isso, dá uma olhada em <Link href="/como-funciona" className="text-primary underline-offset-4 hover:underline">como funciona</Link> ou nas{" "}
        <Link href="/integracoes" className="text-primary underline-offset-4 hover:underline">integrações</Link>.
      </p>
      <Link
        href="/"
        className="font-mono inline-block text-[13px] text-muted-foreground hover:text-foreground"
      >
        ← voltar pra home
      </Link>
    </div>
  )
}
