import Link from "next/link"

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-7">
          <Link href="/" className="font-display text-[26px] font-medium tracking-tight">
            producao<span className="text-primary text-[22px]">.app</span>
          </Link>
          <nav className="hidden gap-8 text-[15px] text-muted-foreground md:flex">
            <Link href="#produto" className="transition-colors hover:text-foreground">Produto</Link>
            <Link href="#como" className="transition-colors hover:text-foreground">Como funciona</Link>
            <Link href="#preco" className="transition-colors hover:text-foreground">Preço</Link>
            <Link href="/login" className="transition-colors hover:text-foreground">Entrar</Link>
          </nav>
          <Link
            href="/signup"
            className="rounded-full bg-foreground px-[18px] py-[9px] text-[14px] font-medium text-background transition-colors hover:bg-primary"
          >
            Pedir demo
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-8 pt-[110px] pb-[60px] text-center">
          <div className="mx-auto max-w-[1180px]">
            <span className="mb-7 inline-block rounded-full bg-primary/10 px-[14px] py-[6px] text-[13px] font-medium tracking-wide text-primary">
              painel de experiência do cliente
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
            <div className="flex flex-wrap justify-center gap-[14px]">
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
          </div>
        </section>

        {/* HERO MOCKUP — Painel do cliente (white-label da agência) */}
        <section className="px-8 pb-[100px]">
          <div className="mx-auto max-w-[1180px]">
            <ClientPanelMockup />
            <p className="mt-5 text-center text-[13px] text-muted-foreground">
              Painel da Vitamina Publicitária visto pelo cliente final dela ·{" "}
              <span className="text-primary">white-label real</span>, sem &ldquo;powered by&rdquo;
            </p>
          </div>
        </section>

        {/* Trust */}
        <section className="border-y border-border px-8 py-[60px]">
          <div className="mx-auto max-w-[1180px] text-center">
            <p className="mb-7 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              agências que já operam no Produção
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

        {/* Features */}
        <section id="produto" className="px-8 py-[110px]">
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
                <div key={f.num} className="rounded-[18px] bg-card p-9">
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

        {/* Dashboard mockup — agency view */}
        <section className="px-8 pb-[110px]">
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

        {/* How */}
        <section id="como" className="bg-secondary px-8 py-[110px] text-secondary-foreground">
          <div className="mx-auto max-w-[1180px]">
            <div className="mb-12 text-center">
              <h2 className="font-display mx-auto mb-4 max-w-[700px] text-[clamp(38px,4.5vw,60px)] font-normal leading-[1.08] tracking-tight text-secondary-foreground">
                O painel que o seu{" "}
                <em className="font-normal italic text-primary">cliente abre todo dia</em>.
              </h2>
              <p className="mx-auto max-w-[540px] text-[19px] text-secondary-foreground/65">
                Não é dashboard interno. É a vitrine premium que sua agência entrega.
              </p>
            </div>

            {/* Mobile flow mockup */}
            <div className="mb-12">
              <MobileFlowMockup />
            </div>

            <div className="mt-12 grid gap-12 md:grid-cols-3">
              {steps.map((s) => (
                <div key={s.label} className="border-t border-secondary-foreground/15 pt-7">
                  <div className="font-display mb-4 text-[20px] italic text-primary/80">
                    {s.label}
                  </div>
                  <h4 className="font-display mb-3 text-[28px] font-normal leading-[1.15] tracking-tight">
                    {s.title}
                  </h4>
                  <p className="text-[15px] leading-[1.55] text-secondary-foreground/70">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonial */}
        <section className="px-8 py-[130px] text-center">
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
        <section id="preco" className="border-t border-border px-8 py-[110px]">
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
                <div className="t-caption mb-3">Plano único</div>
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
        <section className="border-t border-border px-8 py-[130px] text-center">
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

      <footer className="border-t border-border px-8 py-12">
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
   MOCKUPS — telas do app inline. JSX puro, sem assets externos.
   Cada mockup é uma representação visual de uma tela real, com a
   paleta da marca aplicada. Use o mesmo Design System (cards, cores)
   pra que pareça parte da experiência, não ilustração genérica.
   ──────────────────────────────────────────────────────────────── */

// Painel que o CLIENTE FINAL vê (white-label da agência). Hero piece.
function ClientPanelMockup() {
  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_30px_60px_-20px_rgba(26,22,18,0.18),0_18px_30px_-12px_rgba(204,120,92,0.12)]">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-5 py-3.5">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-border" />
          <div className="h-3 w-3 rounded-full bg-border" />
          <div className="h-3 w-3 rounded-full bg-border" />
        </div>
        <div className="ml-3 flex-1 rounded-md bg-background px-3 py-1 text-[12px] text-muted-foreground">
          vitaminapublicitaria.com/painel
        </div>
      </div>

      {/* App content */}
      <div className="bg-background">
        {/* App header — white-label da agência */}
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

        {/* Body grid */}
        <div className="grid gap-5 p-8 md:grid-cols-3">
          {/* Próximo pra aprovar — destaque */}
          <div className="md:col-span-2 rounded-[14px] border border-primary/30 bg-primary/[0.04] p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="t-caption mb-1 text-primary">próximo pra aprovar</div>
                <h4 className="font-display text-[22px] font-medium leading-tight">
                  Carrossel · Lançamento Café Outono
                </h4>
              </div>
              <span className="rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                Instagram · 6 slides
              </span>
            </div>
            <div className="mb-5 flex gap-2.5">
              {/* Mini-mock dos slides do carrossel */}
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
              <span className="ml-1 text-[12px] text-muted-foreground">vai pro ar dia 22 às 8:30</span>
            </div>
          </div>

          {/* Stats card */}
          <div className="space-y-3">
            <div className="rounded-[14px] border border-border bg-card p-5">
              <div className="t-caption mb-2">publicados em maio</div>
              <div className="font-display text-[40px] font-normal leading-none">28</div>
              <div className="mt-1 text-[12px] text-muted-foreground">de 30 combinados</div>
            </div>
            <div className="rounded-[14px] border border-border bg-card p-5">
              <div className="t-caption mb-2">aprovações pendentes</div>
              <div className="font-display text-[40px] font-normal leading-none text-primary">2</div>
              <div className="mt-1 text-[12px] text-muted-foreground">prazo médio 1d 4h</div>
            </div>
          </div>

          {/* Recent posts row */}
          <div className="md:col-span-3 mt-2">
            <div className="t-caption mb-3">últimos 7 dias no feed</div>
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
                    <div className="text-[11px] font-medium text-muted-foreground">{p.platform}</div>
                    <div className="mt-0.5 truncate text-[13px]">{p.caption}</div>
                    <div className="mt-2 flex gap-2 text-[11px] text-muted-foreground">
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
  { platform: "Instagram · Reel", caption: "Do grão à xícara, em 60s.", likes: "8.4k", comments: 132, c1: "#C19A6B", c2: "#5C4A38" },
  { platform: "Instagram", caption: "Café gelado pra esse calor.", likes: "894", comments: 28, c1: "#E8C9A0", c2: "#9C7449" },
  { platform: "Facebook", caption: "Sábado tem música ao vivo.", likes: "342", comments: 15, c1: "#B89971", c2: "#6F5638" },
  { platform: "TikTok", caption: "Latte art em 30s. Tenta aí.", likes: "12.1k", comments: 287, c1: "#D9B58C", c2: "#7A5C3A" },
]

// Dashboard interno da agência — visão multi-cliente
function AgencyDashboardMockup() {
  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_30px_60px_-20px_rgba(26,22,18,0.15)]">
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-5 py-3.5">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-border" />
          <div className="h-3 w-3 rounded-full bg-border" />
          <div className="h-3 w-3 rounded-full bg-border" />
        </div>
        <div className="ml-3 flex-1 rounded-md bg-background px-3 py-1 text-[12px] text-muted-foreground">
          producao.app/dashboard
        </div>
      </div>

      <div className="bg-background">
        {/* App header */}
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
            <div className="rounded-md border border-border bg-background px-3 py-1 text-[12px] text-muted-foreground">
              Vitamina Publicitária ▾
            </div>
            <div className="h-7 w-7 rounded-full bg-foreground/80" />
          </div>
        </div>

        {/* KPI row */}
        <div className="grid gap-4 border-b border-border px-8 py-5 md:grid-cols-4">
          {[
            { label: "clientes ativos", value: "12", sub: "de 15 inclusos" },
            { label: "publicados em maio", value: "184", sub: "+12% vs abril" },
            { label: "aprovações pendentes", value: "7", sub: "prazo médio 1d 6h", accent: true },
            { label: "taxa de aprovação 24h", value: "82%", sub: "meta 85%" },
          ].map((kpi) => (
            <div key={kpi.label}>
              <div className="t-caption mb-1.5">{kpi.label}</div>
              <div className={`font-display text-[32px] font-normal leading-none ${kpi.accent ? "text-primary" : ""}`}>
                {kpi.value}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Clients list */}
        <div className="p-8">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-display text-[20px] font-medium">Clientes</h4>
            <div className="flex gap-2 text-[12px] text-muted-foreground">
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
                    <div className="text-[12px] text-muted-foreground">{c.platforms}</div>
                  </div>
                </div>
                <div className="col-span-2 text-[13px]">
                  <span className="text-muted-foreground">publicados:</span> {c.published}
                </div>
                <div className="col-span-2 text-[13px]">
                  <span className="text-muted-foreground">pendentes:</span>{" "}
                  <span className={c.pending > 0 ? "font-medium text-primary" : ""}>{c.pending}</span>
                </div>
                <div className="col-span-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
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
  { name: "Doce Lar Cafés", initial: "D", color: "#8B6F47", platforms: "IG · Reels · TikTok", published: 28, pending: 2, status: "pending", statusLabel: "2 aprovações pendentes" },
  { name: "Atelier Norte", initial: "A", color: "#5C4A38", platforms: "IG · LinkedIn", published: 14, pending: 0, status: "ok", statusLabel: "tudo em dia" },
  { name: "Praia Solar", initial: "P", color: "#CC785C", platforms: "IG · TikTok · YT", published: 19, pending: 1, status: "pending", statusLabel: "1 aprovação pendente" },
  { name: "Estúdio Linho", initial: "E", color: "#7A6A5C", platforms: "IG · Pinterest", published: 22, pending: 0, status: "ok", statusLabel: "tudo em dia" },
  { name: "Boa Praça", initial: "B", color: "#A8825F", platforms: "FB · IG", published: 11, pending: 0, status: "ok", statusLabel: "tudo em dia" },
]

// Mobile flow — WhatsApp → painel → aprovado. 3 phones lado a lado.
function MobileFlowMockup() {
  return (
    <div className="mx-auto flex max-w-[860px] flex-wrap items-end justify-center gap-6 md:flex-nowrap">
      {/* Phone 1 — WhatsApp */}
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

      {/* Phone 2 — Painel abrindo */}
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
          <div className="t-caption mb-1.5 text-[8px] text-primary">próximo pra aprovar</div>
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

      {/* Phone 3 — Aprovado */}
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
          <div className="mb-3 text-[9px] leading-relaxed text-muted-foreground">
            Publicação automática<br />
            dia 22 às 8:30 — IG, FB
          </div>
          <div className="mt-2 rounded-full bg-primary/10 px-3 py-1 text-[9px] font-medium text-primary">
            tudo em dia ✓
          </div>
        </div>
      </PhoneFrame>
    </div>
  )
}

function PhoneFrame({
  children,
  label,
  highlight = false,
}: {
  children: React.ReactNode
  label: string
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative w-[180px] overflow-hidden rounded-[28px] border-[6px] bg-background shadow-[0_24px_48px_-20px_rgba(0,0,0,0.4)] ${
          highlight ? "border-primary/40" : "border-[#1A1612]"
        }`}
        style={{ height: 360 }}
      >
        {/* Notch */}
        <div className="absolute left-1/2 top-0 z-10 h-3 w-16 -translate-x-1/2 rounded-b-md bg-[#1A1612]" />
        <div className="flex h-full flex-col">{children}</div>
      </div>
      <div className="mt-3 font-display text-[13px] italic text-secondary-foreground/70">
        {label}
      </div>
    </div>
  )
}
