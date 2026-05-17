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
        <section className="px-8 pt-[120px] pb-[100px] text-center">
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
