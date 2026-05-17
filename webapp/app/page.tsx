import Link from "next/link"
import { ThemeToggle } from "@/components/dashboard/theme-toggle"

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Subtle tech grid overlay on the WHOLE page — very low opacity */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.35] tech-grid"
        style={{ maskImage: "radial-gradient(ellipse at center, black 20%, transparent 75%)" }}
      />

      {/* Nav */}
      <header className="relative z-10 border-b border-border/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-6">
          <Link href="/" className="font-display text-[26px] font-medium tracking-tight">
            producao<span className="text-primary text-[22px]">.app</span>
          </Link>
          <nav className="hidden gap-8 text-[15px] text-muted-foreground md:flex">
            <Link href="#produto" className="transition-colors hover:text-foreground">Produto</Link>
            <Link href="#como" className="transition-colors hover:text-foreground">Como funciona</Link>
            <Link href="#integracoes" className="transition-colors hover:text-foreground">Integrações</Link>
            <Link href="#preco" className="transition-colors hover:text-foreground">Preço</Link>
            <Link href="/login" className="transition-colors hover:text-foreground">Entrar</Link>
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden items-center rounded-md border border-border bg-background sm:flex">
              <ThemeToggle />
            </div>
            <Link
              href="/signup"
              className="rounded-full bg-foreground px-[18px] py-[9px] text-[14px] font-medium text-background transition-colors hover:bg-primary"
            >
              Pedir demo
            </Link>
          </div>
        </div>
      </header>

      <main className="relative flex-1">
        {/* Hero — coral radial atrás + grid sutil + status pulsante */}
        <section className="relative px-8 pt-[100px] pb-[60px] text-center">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[700px] tech-radial" />
          <div className="relative mx-auto max-w-[1180px]">
            <span className="font-mono mb-7 inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-[14px] py-[6px] text-[12px] tracking-tight text-muted-foreground backdrop-blur">
              <span className="text-primary">●</span>
              <span>v1.0 · painel de experiência do cliente</span>
            </span>
            <h1 className="font-display mx-auto mb-7 max-w-[900px] text-[clamp(52px,7.5vw,104px)] font-normal leading-[1.02] tracking-tight">
              Mais conteúdo saindo.{" "}
              <em className="font-normal italic text-primary">
                Sem ninguém se matando.
              </em>
            </h1>
            <p className="mx-auto mb-11 max-w-[620px] text-[21px] leading-[1.5] text-muted-foreground">
              O painel premium pro cliente da agência aprovar, acompanhar e ver tudo que tá rolando —
              plugado no que sua agência já usa.
            </p>
            <div className="mb-9 flex flex-wrap justify-center gap-[14px]">
              <Link
                href="/signup"
                className="rounded-full bg-foreground px-[26px] py-[14px] text-[15px] font-medium text-background transition-colors hover:bg-primary"
              >
                Pedir demo
              </Link>
              <Link
                href="#como"
                className="rounded-full border border-border px-[26px] py-[14px] text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                Ver como funciona
              </Link>
            </div>
            <LiveStatus />
          </div>
        </section>

        {/* HERO MOCKUP — Painel do cliente */}
        <section className="relative px-8 pb-[100px]">
          <div className="mx-auto max-w-[1180px]">
            <ClientPanelMockup />
            <p className="mt-5 text-center text-[13px] text-muted-foreground">
              Painel da Vitamina Publicitária visto pelo cliente final dela ·{" "}
              <span className="text-primary">white-label real</span>, sem &ldquo;powered by&rdquo;
            </p>
          </div>
        </section>

        {/* Trust */}
        <section className="relative border-y border-border/70 bg-card/30 px-8 py-[60px]">
          <div className="mx-auto max-w-[1180px] text-center">
            <p className="font-mono mb-7 text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
              agências que já operam no producao.app
            </p>
            <div className="font-display flex flex-wrap items-center justify-center gap-x-14 gap-y-3 text-[22px] font-medium italic opacity-55">
              <span>Vitamina</span>
              <span>Studio Bom</span>
              <span>Mesa &amp; Co.</span>
              <span>Boa Praça</span>
              <span>Conteúdo Sul</span>
            </div>
          </div>
        </section>

        {/* TECH FLOW DIAGRAM */}
        <section className="relative px-8 py-[100px]">
          <div className="mx-auto max-w-[1180px]">
            <div className="mb-12 text-center">
              <span className="font-mono mb-3 inline-block text-[12px] uppercase tracking-[0.12em] text-primary">
                arquitetura
              </span>
              <h2 className="font-display mx-auto mb-3 max-w-[700px] text-[clamp(36px,4.2vw,54px)] font-normal leading-[1.1] tracking-tight">
                Uma camada conectando <em className="italic text-primary">o que você já usa</em>.
              </h2>
              <p className="mx-auto max-w-[540px] text-[18px] text-muted-foreground">
                Sem substituir nada. Apenas plugando — Notion, WhatsApp, redes sociais.
              </p>
            </div>
            <TechFlow />
          </div>
        </section>

        {/* Features */}
        <section id="produto" className="relative px-8 py-[100px]">
          <div className="mx-auto max-w-[1180px]">
            <div className="mb-16 text-center">
              <h2 className="font-display mx-auto mb-4 max-w-[700px] text-[clamp(38px,4.5vw,60px)] font-normal leading-[1.08] tracking-tight">
                Tudo num lugar só —{" "}
                <em className="font-normal italic text-primary">e nada migrando.</em>
              </h2>
              <p className="mx-auto max-w-[540px] text-[19px] text-muted-foreground">
                Sua agência continua trabalhando como já trabalha. Produção pluga, aprova e publica.
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {features.map((f) => (
                <div key={f.num} className="rounded-[18px] border border-border bg-card p-9">
                  <div className="font-display mb-[18px] text-[28px] italic text-primary">
                    {f.num}
                  </div>
                  <h3 className="font-display mb-3 text-[26px] font-medium leading-[1.2] tracking-tight">
                    {f.title}
                  </h3>
                  <p className="text-[16px] leading-[1.55] text-muted-foreground">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TERMINAL LOG — "como uma aprovação acontece" */}
        <section className="relative bg-card/30 px-8 py-[100px]">
          <div className="mx-auto max-w-[1180px]">
            <div className="mb-10 grid gap-12 md:grid-cols-2 md:items-center">
              <div>
                <span className="font-mono mb-3 inline-block text-[12px] uppercase tracking-[0.12em] text-primary">
                  log de uma aprovação real
                </span>
                <h3 className="font-display mb-4 text-[clamp(32px,3.8vw,46px)] font-normal leading-[1.1] tracking-tight">
                  Cada post tem <em className="italic text-primary">trilha completa</em>.
                </h3>
                <p className="text-[17px] leading-[1.55] text-muted-foreground">
                  Quando o cliente aprovou. De que dispositivo. Quanto tempo levou.
                  Pra qual conta foi publicado. Resposta da API.{" "}
                  <span className="text-foreground">Tudo auditável.</span>
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <TechBadge>idempotente</TechBadge>
                  <TechBadge>atomic claim</TechBadge>
                  <TechBadge>aprovação tácita 30d</TechBadge>
                  <TechBadge>retry exponencial</TechBadge>
                </div>
              </div>
              <TerminalLog />
            </div>
          </div>
        </section>

        {/* Dashboard mockup — agency view */}
        <section className="relative px-8 py-[100px]">
          <div className="mx-auto max-w-[1180px]">
            <div className="mb-10 text-center">
              <h3 className="font-display mb-3 text-[clamp(28px,3vw,38px)] font-normal leading-[1.15] tracking-tight">
                Pra agência, <em className="italic text-primary">uma tela só</em>.
              </h3>
              <p className="mx-auto max-w-[520px] text-[17px] text-muted-foreground">
                Todos os clientes, todas as plataformas, todo o status. Sem trocar de aba.
              </p>
            </div>
            <AgencyDashboardMockup />
          </div>
        </section>

        {/* INTEGRATIONS GRID */}
        <section id="integracoes" className="relative bg-card/30 px-8 py-[100px]">
          <div className="mx-auto max-w-[1180px]">
            <div className="mb-10 text-center">
              <span className="font-mono mb-3 inline-block text-[12px] uppercase tracking-[0.12em] text-primary">
                integrações
              </span>
              <h3 className="font-display mb-3 text-[clamp(32px,3.8vw,46px)] font-normal leading-[1.1] tracking-tight">
                Conecta com <em className="italic text-primary">tudo que sua agência já usa</em>.
              </h3>
              <p className="mx-auto max-w-[540px] text-[17px] text-muted-foreground">
                APIs oficiais. OAuth 2.0. Webhooks em tempo real onde possível.
              </p>
            </div>
            <Integrations />
          </div>
        </section>

        {/* How */}
        <section id="como" className="bg-foreground px-8 py-[110px] text-background">
          <div className="mx-auto max-w-[1180px]">
            <div className="mb-12 text-center">
              <span className="font-mono mb-3 inline-block text-[12px] uppercase tracking-[0.12em] text-primary">
                fluxo do cliente final
              </span>
              <h2 className="font-display mx-auto mb-4 max-w-[700px] text-[clamp(38px,4.5vw,60px)] font-normal leading-[1.08] tracking-tight">
                O painel que o seu{" "}
                <em className="font-normal italic text-primary">cliente abre todo dia</em>.
              </h2>
              <p className="mx-auto max-w-[540px] text-[19px] text-background/60">
                Não é dashboard interno. É a vitrine premium que sua agência entrega.
              </p>
            </div>

            <div className="mb-12">
              <MobileFlowMockup />
            </div>

            <div className="mt-12 grid gap-12 md:grid-cols-3">
              {steps.map((s) => (
                <div key={s.label} className="border-t border-background/15 pt-7">
                  <div className="font-display mb-4 text-[20px] italic text-primary/80">
                    {s.label}
                  </div>
                  <h4 className="font-display mb-3 text-[28px] font-normal leading-[1.15] tracking-tight">
                    {s.title}
                  </h4>
                  <p className="text-[15px] leading-[1.55] text-background/70">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonial */}
        <section className="relative px-8 py-[130px] text-center">
          <div className="mx-auto max-w-[1180px]">
            <blockquote className="font-display mx-auto mb-9 max-w-[920px] text-[clamp(28px,3.2vw,42px)] font-light leading-[1.25] tracking-tight">
              &ldquo;Antes a gente perdia 4 horas por semana caçando aprovação no WhatsApp. Hoje a
              agência só liga pro cliente quando{" "}
              <em className="italic">tem coisa boa</em> pra mostrar.&rdquo;
            </blockquote>
            <cite className="text-[15px] not-italic text-muted-foreground">
              <strong className="font-medium text-foreground">Marina Sá</strong>, sócia operacional ·
              agência de 12 clientes
            </cite>
          </div>
        </section>

        {/* Pricing */}
        <section id="preco" className="relative border-t border-border/70 px-8 py-[110px]">
          <div className="mx-auto max-w-[1180px]">
            <div className="mb-16 text-center">
              <h2 className="font-display mx-auto mb-4 max-w-[700px] text-[clamp(38px,4.5vw,60px)] font-normal leading-[1.08] tracking-tight">
                Um preço. <em className="font-normal italic text-primary">Sem ginástica.</em>
              </h2>
              <p className="mx-auto max-w-[540px] text-[19px] text-muted-foreground">
                Menos que uma pessoa operacional. Mais conteúdo do que um time inteiro.
              </p>
            </div>
            <div className="mx-auto max-w-[640px] rounded-[18px] border border-border bg-card p-10">
              <div className="mb-8 text-center">
                <div className="font-mono mb-3 text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
                  plano único
                </div>
                <div className="font-display mb-2 text-[72px] leading-none">
                  R$ <span className="text-primary">1.500</span>
                </div>
                <div className="text-[15px] text-muted-foreground">por mês · 5 clientes inclusos</div>
              </div>
              <ul className="mb-9 space-y-3 text-[15px]">
                {pricingFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="mt-[7px] block h-[5px] w-[5px] shrink-0 rounded-full bg-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="block w-full rounded-full bg-foreground py-[14px] text-center text-[15px] font-medium text-background transition-colors hover:bg-primary"
              >
                Pedir demo de 30 minutos
              </Link>
              <p className="mt-4 text-center text-[13px] text-muted-foreground">
                14 dias de teste. Sem cartão.
              </p>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative border-t border-border/70 px-8 py-[130px] text-center">
          <div className="mx-auto max-w-[1180px]">
            <h2 className="font-display mx-auto mb-8 max-w-[780px] text-[clamp(44px,5.5vw,72px)] font-light leading-[1.05] tracking-tight">
              Pronto pra parar de{" "}
              <em className="font-light italic text-primary">caçar aprovação no WhatsApp?</em>
            </h2>
            <Link
              href="/signup"
              className="inline-block rounded-full bg-foreground px-7 py-[14px] text-[15px] font-medium text-background transition-colors hover:bg-primary"
            >
              Pedir demo
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-border/70 bg-card/30 px-8 py-12">
        <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="font-display text-[18px] font-medium">
              producao<span className="text-primary">.app</span>
            </div>
            <div className="mt-1.5 text-[13px] text-muted-foreground">
              Um produto da Vitamina Publicitária. São Paulo, 2026.
            </div>
          </div>
          <nav className="flex flex-wrap gap-6 text-[14px] text-muted-foreground">
            <Link href="/terms" className="transition-colors hover:text-foreground">Termos</Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privacidade</Link>
            <Link href="/login" className="transition-colors hover:text-foreground">Entrar</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

const features = [
  {
    num: "01",
    title: "Plug no planning",
    body: "Conecta o Notion (ou Sheets, Trello, Airtable) que sua agência já usa. Zero migração, zero ferramenta nova pra aprender.",
  },
  {
    num: "02",
    title: "Aprovação no WhatsApp",
    body: "O cliente recebe no WhatsApp, abre o painel no celular e aprova em 1 toque. Se não responder em 30 dias, aprovado.",
  },
  {
    num: "03",
    title: "Publicação automática",
    body: "Aprovou? Sai. Instagram, Facebook, YouTube, TikTok, LinkedIn. O conteúdo combinado, publicado. Toda vez.",
  },
]

const steps = [
  {
    label: "passo um",
    title: "O cliente recebe um link.",
    body: "WhatsApp com o post pra aprovar. Toque, abre o painel premium da sua agência — com cor, logo e fonte da agência. Zero powered by.",
  },
  {
    label: "passo dois",
    title: "Aprova em 1 toque.",
    body: "Slide pra aprovar. Comentário rápido se quiser. Áudio do WhatsApp embutido como feedback. Sem caçar conversa antiga.",
  },
  {
    label: "passo três",
    title: "Publica. Sozinho.",
    body: "Sua agência não toca em nada. O post vai pro ar no horário combinado. No fim do mês, story-report bonito pro cliente compartilhar.",
  },
]

const pricingFeatures = [
  "5 clientes ativos inclusos · R$ 197/cliente extra",
  "Seats ilimitados na agência",
  "Posts ilimitados em todas as plataformas (IG, FB, YT, TT, LinkedIn)",
  "Portal premium white-label com domínio próprio",
  "Aprovação por WhatsApp com cadeia de aprovadores",
  "Plug em Notion, Sheets, Trello, Airtable",
  "Suporte humano por WhatsApp",
]

/* ─────────────────────────────────────────────────────────────────
   MOCKUPS & ELEMENTOS TECH — JSX puro, sem assets externos.
   ──────────────────────────────────────────────────────────────── */

// Status pulsante mono "● 1.847 posts publicados nas últimas 24h"
function LiveStatus() {
  return (
    <div className="font-mono inline-flex items-center gap-3 rounded-full border border-border bg-card/40 px-4 py-1.5 text-[12px] backdrop-blur">
      <span className="relative inline-flex h-2 w-2 items-center justify-center">
        <span className="absolute h-2 w-2 rounded-full bg-primary opacity-70 pulse-dot" />
        <span className="relative h-2 w-2 rounded-full bg-primary" />
      </span>
      <span className="text-muted-foreground">
        <span className="text-foreground font-medium">1.847</span> posts publicados nas últimas{" "}
        <span className="text-foreground font-medium">24h</span>
      </span>
    </div>
  )
}

// Tech flow diagram horizontal — Notion → Producao → WhatsApp → Plataformas
function TechFlow() {
  return (
    <div className="rounded-[18px] border border-border bg-card/40 p-8 backdrop-blur">
      <div className="flex flex-wrap items-center justify-center gap-3 md:flex-nowrap md:gap-1">
        <FlowNode icon="N" label="Notion" sub="planning" />
        <FlowArrow />
        <FlowNode icon="P" label="producao.app" sub="aprovação + portal" highlight />
        <FlowArrow />
        <FlowNode icon="W" label="WhatsApp" sub="canal do cliente" />
        <FlowArrow />
        <FlowNode icon="↗" label="5 redes" sub="IG · FB · YT · TT · LI" />
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <TechBadge>REST API</TechBadge>
        <TechBadge>OAuth 2.0</TechBadge>
        <TechBadge>Webhooks</TechBadge>
        <TechBadge>WhatsApp Meta Cloud</TechBadge>
        <TechBadge>SLA 99.9%</TechBadge>
      </div>
    </div>
  )
}

function FlowNode({
  icon, label, sub, highlight = false,
}: { icon: string; label: string; sub: string; highlight?: boolean }) {
  return (
    <div
      className={`flex w-full max-w-[200px] flex-col items-center gap-2 rounded-[14px] border px-5 py-5 text-center md:w-auto md:flex-1 ${
        highlight ? "border-primary/40 bg-primary/[0.06]" : "border-border bg-background"
      }`}
    >
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-xl text-[18px] font-semibold ${
          highlight ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        {icon}
      </div>
      <div className="font-display text-[16px] font-medium leading-tight">{label}</div>
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {sub}
      </div>
    </div>
  )
}

function FlowArrow() {
  return (
    <div className="hidden md:block">
      <svg width="40" height="14" viewBox="0 0 40 14" fill="none" className="text-primary">
        <path d="M0 7H35M35 7L29 1M35 7L29 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 3" />
      </svg>
    </div>
  )
}

function TechBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
      {children}
    </span>
  )
}

// Terminal log — pseudo-log de uma aprovação real
function TerminalLog() {
  const lines = [
    { ts: "14:32:01", tag: "[notion]   ", text: "post aprovado interno em planning.notion.so/..." },
    { ts: "14:32:02", tag: "[producao] ", text: "link de aprovação gerado: producao.app/c/d4f..." },
    { ts: "14:32:03", tag: "[whatsapp] ", text: "wpp template enviado (meta cloud api)" },
    { ts: "14:44:18", tag: "[client]   ", text: "cliente abriu painel · slide-aprovado em 2.3s" },
    { ts: "14:44:19", tag: "[publisher]", text: "agendado · ig:doce_lar · fb:doce_lar · tt:docelar" },
    { ts: "08:30:00", tag: "[done]     ", text: "✓ publicado em 3 plataformas · all green", success: true },
  ]
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-lg">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-border" />
          <div className="h-2.5 w-2.5 rounded-full bg-border" />
          <div className="h-2.5 w-2.5 rounded-full bg-border" />
        </div>
        <div className="font-mono ml-2 text-[11px] text-muted-foreground">
          producao.log — aprovação real
        </div>
      </div>
      <div className="font-mono p-5 text-[12px] leading-relaxed">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-muted-foreground/60">{l.ts}</span>
            <span className={l.success ? "text-primary" : "text-primary/70"}>{l.tag}</span>
            <span className={l.success ? "text-foreground" : "text-muted-foreground"}>
              {l.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Integrations grid — sources (planning) + channels + targets (publishing)
function Integrations() {
  return (
    <div className="rounded-[18px] border border-border bg-card/60 p-8 backdrop-blur md:p-10">
      <div className="grid gap-10 md:grid-cols-3">
        <IntegrationGroup
          label="planning"
          items={["Notion", "Google Sheets", "Trello", "Asana", "Airtable"]}
          live={["Notion"]}
        />
        <IntegrationGroup
          label="canais do cliente"
          items={["WhatsApp", "E-mail", "Slack"]}
          live={["WhatsApp"]}
        />
        <IntegrationGroup
          label="publicação"
          items={["Instagram", "Facebook", "YouTube", "TikTok", "LinkedIn"]}
          live={["Instagram", "Facebook", "YouTube", "TikTok", "LinkedIn"]}
        />
      </div>
      <div className="mt-8 border-t border-border pt-6">
        <p className="font-mono text-center text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="text-primary">●</span> em produção
          <span className="mx-3 opacity-50">/</span>
          <span className="text-muted-foreground/60">○</span> roadmap próximas 8 semanas
        </p>
      </div>
    </div>
  )
}

function IntegrationGroup({
  label, items, live,
}: { label: string; items: string[]; live: string[] }) {
  return (
    <div>
      <div className="font-mono mb-4 text-[11px] uppercase tracking-[0.12em] text-primary">
        {label}
      </div>
      <div className="flex flex-col gap-2">
        {items.map((i) => {
          const isLive = live.includes(i)
          return (
            <div
              key={i}
              className={`font-mono flex items-center gap-2.5 rounded-md border px-3 py-2 text-[13px] ${
                isLive ? "border-border bg-background text-foreground" : "border-border/40 bg-transparent text-muted-foreground/60"
              }`}
            >
              <span className={isLive ? "text-primary" : "text-muted-foreground/40"}>
                {isLive ? "●" : "○"}
              </span>
              <span>{i}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Painel que o CLIENTE FINAL vê (white-label da agência). Hero piece.
function ClientPanelMockup() {
  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_30px_60px_-20px_rgba(0,0,0,0.35),0_18px_30px_-12px_rgba(204,120,92,0.18)]">
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-5 py-3.5">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-border" />
          <div className="h-3 w-3 rounded-full bg-border" />
          <div className="h-3 w-3 rounded-full bg-border" />
        </div>
        <div className="font-mono ml-3 flex-1 rounded-md bg-background px-3 py-1 text-[12px] text-muted-foreground">
          vitaminapublicitaria.com/painel
        </div>
      </div>

      <div className="bg-background">
        <div className="flex items-center justify-between border-b border-border px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-[15px] font-bold text-background">
              V
            </div>
            <div>
              <div className="font-display text-[18px] font-medium">Vitamina Publicitária</div>
              <div className="text-[12px] text-muted-foreground">Painel · Doce Lar Cafés</div>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary">
              tudo em dia ✓
            </span>
          </div>
        </div>

        <div className="grid gap-5 p-8 md:grid-cols-3">
          <div className="md:col-span-2 rounded-[14px] border border-primary/30 bg-primary/[0.04] p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-mono mb-1 text-[11px] uppercase tracking-[0.12em] text-primary">
                  próximo pra aprovar
                </div>
                <h4 className="font-display text-[22px] font-medium leading-tight">
                  Carrossel · Lançamento Café Outono
                </h4>
              </div>
              <span className="font-mono rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11px] text-muted-foreground">
                Instagram · 6 slides
              </span>
            </div>
            <div className="mb-5 flex gap-2.5">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="aspect-square flex-1 rounded-md border border-border"
                  style={{
                    background: `linear-gradient(135deg, hsl(${20 + i * 8} ${50 - i * 4}% ${75 - i * 3}%), hsl(${30 + i * 8} ${40 - i * 3}% ${68 - i * 4}%))`,
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded-full bg-foreground px-5 py-2 text-[13px] font-medium text-background">
                Aprovar este post
              </button>
              <button className="rounded-full border border-border px-5 py-2 text-[13px] font-medium">
                Pedir ajuste
              </button>
              <span className="font-mono ml-1 text-[11px] text-muted-foreground">
                vai pro ar dia 22 às 08:30
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[14px] border border-border bg-card p-5">
              <div className="font-mono mb-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                publicados em maio
              </div>
              <div className="font-display text-[40px] font-normal leading-none">28</div>
              <div className="font-mono mt-1 text-[11px] text-muted-foreground">de 30 combinados</div>
            </div>
            <div className="rounded-[14px] border border-border bg-card p-5">
              <div className="font-mono mb-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                aprovações pendentes
              </div>
              <div className="font-display text-[40px] font-normal leading-none text-primary">2</div>
              <div className="font-mono mt-1 text-[11px] text-muted-foreground">prazo médio 1d 4h</div>
            </div>
          </div>

          <div className="md:col-span-3 mt-2">
            <div className="font-mono mb-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              últimos 7 dias no feed
            </div>
            <div className="flex gap-3 overflow-x-auto">
              {recentPosts.map((p, i) => (
                <div
                  key={i}
                  className="w-[170px] shrink-0 overflow-hidden rounded-[12px] border border-border bg-card"
                >
                  <div
                    className="aspect-square"
                    style={{
                      background: `linear-gradient(${135 + i * 30}deg, ${p.c1}, ${p.c2})`,
                    }}
                  />
                  <div className="p-3">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {p.platform}
                    </div>
                    <div className="mt-1 truncate text-[13px]">{p.caption}</div>
                    <div className="font-mono mt-2 flex gap-2 text-[11px] text-muted-foreground">
                      <span>♡ {p.likes}</span>
                      <span>· {p.comments} 💬</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const recentPosts = [
  { platform: "Instagram", caption: "Bom dia, café & vinil.", likes: "1.2k", comments: 47, c1: "#D4B896", c2: "#8B6F47" },
  { platform: "IG Reel", caption: "Do grão à xícara, em 60s.", likes: "8.4k", comments: 132, c1: "#C19A6B", c2: "#5C4A38" },
  { platform: "Instagram", caption: "Café gelado pra esse calor.", likes: "894", comments: 28, c1: "#E8C9A0", c2: "#9C7449" },
  { platform: "Facebook", caption: "Sábado tem música ao vivo.", likes: "342", comments: 15, c1: "#B89971", c2: "#6F5638" },
  { platform: "TikTok", caption: "Latte art em 30s. Tenta aí.", likes: "12.1k", comments: 287, c1: "#D9B58C", c2: "#7A5C3A" },
]

function AgencyDashboardMockup() {
  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_30px_60px_-20px_rgba(0,0,0,0.3)]">
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-5 py-3.5">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-border" />
          <div className="h-3 w-3 rounded-full bg-border" />
          <div className="h-3 w-3 rounded-full bg-border" />
        </div>
        <div className="font-mono ml-3 flex-1 rounded-md bg-background px-3 py-1 text-[12px] text-muted-foreground">
          producao.app/dashboard
        </div>
      </div>

      <div className="bg-background">
        <div className="flex items-center justify-between border-b border-border px-8 py-5">
          <div className="flex items-center gap-6">
            <div className="font-display text-[17px] font-medium">
              producao<span className="text-primary">.app</span>
            </div>
            <nav className="hidden gap-5 text-[13px] text-muted-foreground md:flex">
              <span className="text-foreground">Visão geral</span>
              <span>Calendário</span>
              <span>Clientes</span>
              <span>Aprovações</span>
              <span>Relatórios</span>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="font-mono rounded-md border border-border bg-background px-3 py-1 text-[12px] text-muted-foreground">
              Vitamina Publicitária ▾
            </div>
            <div className="h-7 w-7 rounded-full bg-foreground/80" />
          </div>
        </div>

        <div className="grid gap-4 border-b border-border px-8 py-5 md:grid-cols-4">
          {[
            { label: "clientes ativos", value: "12", sub: "de 15 inclusos" },
            { label: "publicados em maio", value: "184", sub: "+12% vs abril" },
            { label: "aprovações pendentes", value: "7", sub: "prazo médio 1d 6h", accent: true },
            { label: "taxa de aprovação 24h", value: "82%", sub: "meta 85%" },
          ].map((kpi) => (
            <div key={kpi.label}>
              <div className="font-mono mb-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {kpi.label}
              </div>
              <div className={`font-display text-[32px] font-normal leading-none ${kpi.accent ? "text-primary" : ""}`}>
                {kpi.value}
              </div>
              <div className="font-mono mt-1 text-[11px] text-muted-foreground">{kpi.sub}</div>
            </div>
          ))}
        </div>

        <div className="p-8">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-display text-[20px] font-medium">Clientes</h4>
            <div className="font-mono flex gap-2 text-[12px] text-muted-foreground">
              <span className="rounded-md bg-muted px-2.5 py-1 text-foreground">todos</span>
              <span className="px-2.5 py-1">em dia</span>
              <span className="px-2.5 py-1">aprovação pendente</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-[12px] border border-border">
            {clients.map((c, i) => (
              <div
                key={c.name}
                className={`grid grid-cols-12 items-center gap-3 px-5 py-4 ${i !== clients.length - 1 ? "border-b border-border" : ""}`}
              >
                <div className="col-span-4 flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-md text-[13px] font-bold text-background"
                    style={{ background: c.color }}
                  >
                    {c.initial}
                  </div>
                  <div>
                    <div className="text-[14px] font-medium">{c.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{c.platforms}</div>
                  </div>
                </div>
                <div className="font-mono col-span-2 text-[13px]">
                  <span className="text-muted-foreground">publicados:</span> {c.published}
                </div>
                <div className="font-mono col-span-2 text-[13px]">
                  <span className="text-muted-foreground">pendentes:</span>{" "}
                  <span className={c.pending > 0 ? "font-medium text-primary" : ""}>{c.pending}</span>
                </div>
                <div className="col-span-3">
                  <span
                    className={`font-mono rounded-full px-2.5 py-1 text-[11px] ${
                      c.status === "ok"
                        ? "bg-foreground/[0.04] text-muted-foreground"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {c.statusLabel}
                  </span>
                </div>
                <div className="col-span-1 text-right text-muted-foreground">›</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const clients = [
  { name: "Doce Lar Cafés", initial: "D", color: "#8B6F47", platforms: "IG · Reels · TikTok", published: 28, pending: 2, status: "pending", statusLabel: "2 pendentes" },
  { name: "Atelier Norte", initial: "A", color: "#5C4A38", platforms: "IG · LinkedIn", published: 14, pending: 0, status: "ok", statusLabel: "tudo em dia" },
  { name: "Praia Solar", initial: "P", color: "#CC785C", platforms: "IG · TikTok · YT", published: 19, pending: 1, status: "pending", statusLabel: "1 pendente" },
  { name: "Estúdio Linho", initial: "E", color: "#7A6A5C", platforms: "IG · Pinterest", published: 22, pending: 0, status: "ok", statusLabel: "tudo em dia" },
  { name: "Boa Praça", initial: "B", color: "#A8825F", platforms: "FB · IG", published: 11, pending: 0, status: "ok", statusLabel: "tudo em dia" },
]

function MobileFlowMockup() {
  return (
    <div className="mx-auto flex max-w-[860px] flex-wrap items-end justify-center gap-6 md:flex-nowrap">
      <PhoneFrame label="1 · WhatsApp">
        <div className="flex h-[36px] items-center justify-between bg-[#075E54] px-3 text-[10px] text-white">
          <span>‹ Doce Lar Cafés</span>
          <span>•••</span>
        </div>
        <div className="flex-1 bg-[#ECE5DD] px-3 py-3">
          <div className="mb-2 text-center text-[9px] text-[#7C8693]">hoje 14:32</div>
          <div className="ml-auto max-w-[80%] rounded-lg rounded-tr-sm bg-[#DCF8C6] p-2 text-[10px] leading-snug text-[#303030] shadow-sm">
            Oi Daniel, novo post pronto pra sua aprovação:{" "}
            <span className="font-medium">&ldquo;Carrossel · Lançamento Café Outono&rdquo;</span>
            <div className="mt-1.5 truncate rounded bg-white/60 px-1.5 py-1 text-[9px] text-[#1F6FB3] underline">
              vitaminapublicitaria.com/painel/...
            </div>
            <div className="mt-1 text-right text-[8px] text-[#7C8693]">14:32 ✓✓</div>
          </div>
        </div>
      </PhoneFrame>

      <PhoneFrame label="2 · Painel" highlight>
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground text-[9px] font-bold text-background">
            V
          </div>
          <div className="text-[9px] leading-tight">
            <div className="font-medium">Vitamina</div>
            <div className="text-muted-foreground">painel · Doce Lar</div>
          </div>
        </div>
        <div className="flex-1 bg-background p-3">
          <div className="font-mono mb-1.5 text-[8px] uppercase tracking-[0.12em] text-primary">
            próximo pra aprovar
          </div>
          <div className="font-display mb-2 text-[12px] font-medium leading-tight">
            Carrossel · Lançamento Café Outono
          </div>
          <div className="mb-2 grid grid-cols-3 gap-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="aspect-square rounded"
                style={{
                  background: `linear-gradient(135deg, hsl(${20 + i * 8} ${50 - i * 4}% ${75 - i * 3}%), hsl(${30 + i * 8} ${40 - i * 3}% ${68 - i * 4}%))`,
                }}
              />
            ))}
          </div>
          <div className="mb-2 rounded-full bg-foreground py-1.5 text-center text-[9px] font-medium text-background">
            → deslize pra aprovar
          </div>
          <div className="text-center text-[8px] text-muted-foreground">
            ou comente pra pedir ajuste
          </div>
        </div>
      </PhoneFrame>

      <PhoneFrame label="3 · No ar">
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground text-[9px] font-bold text-background">
            V
          </div>
          <div className="text-[9px] leading-tight">
            <div className="font-medium">Vitamina</div>
            <div className="text-muted-foreground">painel · Doce Lar</div>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center bg-background p-4 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            ✓
          </div>
          <div className="font-display mb-1 text-[14px] font-medium">Aprovado.</div>
          <div className="font-mono mb-3 text-[8px] leading-relaxed text-muted-foreground">
            publicação automática<br />
            dia 22 às 08:30 · ig · fb
          </div>
          <div className="font-mono mt-2 rounded-full bg-primary/10 px-3 py-1 text-[9px] text-primary">
            tudo em dia ✓
          </div>
        </div>
      </PhoneFrame>
    </div>
  )
}

function PhoneFrame({
  children, label, highlight = false,
}: { children: React.ReactNode; label: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative w-[180px] overflow-hidden rounded-[28px] border-[6px] bg-background shadow-[0_24px_48px_-20px_rgba(0,0,0,0.5)] ${
          highlight ? "border-primary/40" : "border-foreground"
        }`}
        style={{ height: 360 }}
      >
        <div className="absolute left-1/2 top-0 z-10 h-3 w-16 -translate-x-1/2 rounded-b-md bg-foreground" />
        <div className="flex h-full flex-col">{children}</div>
      </div>
      <div className="font-mono mt-3 text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
    </div>
  )
}
