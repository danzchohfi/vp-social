import Link from "next/link"
import { PublicHeader } from "@/components/public/header"
import { PublicFooter } from "@/components/public/footer"

export const metadata = {
  title: "Perguntas frequentes — Produção",
  description:
    "Tudo que agências perguntam antes de testar Produção: preço, integrações, white-label, segurança, aprovação tácita, suporte.",
}

type FaqGroup = { title: string; items: { q: string; a: React.ReactNode }[] }

const GROUPS: FaqGroup[] = [
  {
    title: "Produto",
    items: [
      {
        q: "O cliente da minha agência precisa criar conta?",
        a: (
          <>
            Não. Ele recebe um link único pelo WhatsApp e abre o painel direto no celular. Sem login, sem senha, sem fricção. O link tem validade configurável e é exclusivo do cliente daquela agência.
          </>
        ),
      },
      {
        q: "Posso usar o meu domínio e logo no painel do cliente?",
        a: (
          <>
            Sim — <strong>white-label real</strong>. O painel abre em <code className="font-mono text-primary">suaagencia.com/painel</code> (ou subdomínio próprio), com sua cor primária, logo e fonte. O cliente nunca vê &ldquo;Produção&rdquo; ou &ldquo;powered by&rdquo;.
          </>
        ),
      },
      {
        q: "O que é &ldquo;aprovação tácita&rdquo;?",
        a: (
          <>
            Se o cliente não responder em <span className="text-primary">30 dias</span>, a gente considera aprovado e publica automaticamente. Isso resolve o caso clássico de cliente sumido que trava o calendário inteiro da agência. Janela é configurável e o cliente sempre é avisado da regra.
          </>
        ),
      },
      {
        q: "E se o cliente quiser pedir ajuste em vez de aprovar?",
        a: (
          <>
            Ele clica em &ldquo;Pedir ajuste&rdquo;, escreve um comentário (ou manda áudio do WhatsApp), e a agência recebe no dashboard. O post fica em status &ldquo;ajuste pendente&rdquo; até a agência retomar e re-submeter.
          </>
        ),
      },
    ],
  },
  {
    title: "Setup e integrações",
    items: [
      {
        q: "Preciso migrar meu Notion?",
        a: (
          <>
            Não. A gente se conecta no Notion que você já usa via OAuth oficial, lê as databases que você tem hoje. Você mapeia 5 campos uma vez (status, data, conta, mídia, legenda) e pronto.
          </>
        ),
      },
      {
        q: "Suporta Google Sheets / Trello / Airtable?",
        a: (
          <>
            Notion já em produção. Sheets nas próximas 8 semanas. Trello, Asana, Airtable no roadmap por demanda — se 3 agências pedem, a gente constrói.
          </>
        ),
      },
      {
        q: "Como funciona o WhatsApp? Preciso ter conta Business?",
        a: (
          <>
            Você precisa de WhatsApp Business com Meta Cloud API. A gente ajuda no setup (white-glove). Mensagens vão via template aprovado pela Meta, sem risco de ban. Suporte a múltiplas WABA pra agências grandes.
          </>
        ),
      },
      {
        q: "Quanto tempo demora pra configurar tudo?",
        a: (
          <>
            ~5 minutos pro essencial (Notion + WhatsApp + 1 cliente). Ou 30 minutos com call white-glove (incluso) onde a gente faz junto. Posts começam a sair no mesmo dia.
          </>
        ),
      },
    ],
  },
  {
    title: "Preço e pagamento",
    items: [
      {
        q: "Quanto custa?",
        a: (
          <>
            <strong>R$ 1.500/mês</strong>, plano único, 5 clientes ativos inclusos. <strong>R$ 197</strong> por cliente extra a partir do 6º. Posts ilimitados em todas as plataformas. Anual tem 2 meses grátis.
          </>
        ),
      },
      {
        q: "Tem teste grátis?",
        a: (
          <>
            14 dias de teste sem cartão. Você conecta um cliente real, gente faz setup white-glove junto, e você decide se faz sentido.
          </>
        ),
      },
      {
        q: "Cobram por post publicado ou por plataforma?",
        a: (
          <>
            Não. Posts e plataformas são <strong>ilimitados</strong>. A gente cobra por cliente ativo gerenciado — porque é o que mede valor real entregue.
          </>
        ),
      },
      {
        q: "Posso cancelar quando quiser?",
        a: (
          <>
            Sim, mensal sem multa. Anual tem desconto mas é compromisso de 12 meses. Reembolso pro-rata se cancelar no anual (descontando os meses já usados).
          </>
        ),
      },
    ],
  },
  {
    title: "Segurança e dados",
    items: [
      {
        q: "Onde os dados ficam armazenados?",
        a: (
          <>
            Servidores na <strong>AWS São Paulo</strong> (Neon Postgres, Vercel). Cada agência tem isolamento total — clientes de uma agência são invisíveis pra outra a nível de banco.
          </>
        ),
      },
      {
        q: "Vocês têm acesso aos posts dos meus clientes?",
        a: (
          <>
            Tecnicamente sim (admin de banco), na prática nunca acessamos a não ser que você abra um ticket pedindo. Não usamos seu conteúdo pra treinar IA nem pra mais nada. Auditável.
          </>
        ),
      },
      {
        q: "E LGPD?",
        a: (
          <>
            Conforme LGPD. Cliente final pode pedir exclusão de dados a qualquer momento (botão no painel dele). Logs auditáveis. DPA disponível pra agências enterprise.
          </>
        ),
      },
    ],
  },
  {
    title: "Suporte",
    items: [
      {
        q: "Tem suporte humano?",
        a: (
          <>
            Sim, por WhatsApp em horário comercial (10h-18h SP, dias úteis). Resposta média menos de 1h. Não tem chat-bot, não tem URA — falamos com agência direto.
          </>
        ),
      },
      {
        q: "Quem responde quando eu mando mensagem?",
        a: (
          <>
            Hoje, o founder. Conforme a gente cresce, time de suporte vai aumentar, mas o compromisso é de ter humano técnico no primeiro contato.
          </>
        ),
      },
    ],
  },
]

export default function FaqPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.35] tech-grid"
        style={{ maskImage: "radial-gradient(ellipse at center, black 20%, transparent 75%)" }}
      />
      <PublicHeader />

      <main className="relative flex-1">
        <section className="px-8 pt-[100px] pb-[40px] text-center">
          <div className="relative mx-auto max-w-[1180px]">
            <span className="font-mono mb-5 inline-block text-[12px] uppercase tracking-[0.12em] text-primary">
              perguntas frequentes
            </span>
            <h1 className="font-display mx-auto mb-5 max-w-[800px] text-[clamp(40px,5.5vw,72px)] font-normal leading-[1.05] tracking-tight">
              Tudo que agências{" "}
              <em className="italic text-primary">perguntam antes de testar</em>.
            </h1>
            <p className="mx-auto max-w-[540px] text-[18px] text-muted-foreground">
              Não achou sua pergunta?{" "}
              <Link href="/demo" className="text-primary underline-offset-4 hover:underline">
                Pergunta direto na demo
              </Link>.
            </p>
          </div>
        </section>

        <section className="px-8 py-[60px]">
          <div className="mx-auto max-w-[860px] space-y-[60px]">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <h2 className="font-display mb-6 text-[clamp(24px,3vw,32px)] font-normal leading-tight">
                  {g.title}
                </h2>
                <div className="overflow-hidden rounded-[14px] border border-border bg-card/50">
                  {g.items.map((item, i) => (
                    <details
                      key={item.q}
                      className={`group ${i !== g.items.length - 1 ? "border-b border-border" : ""}`}
                    >
                      <summary className="flex cursor-pointer items-start justify-between gap-4 px-6 py-5 text-[16px] font-medium hover:bg-muted/40">
                        <span>{item.q}</span>
                        <span className="font-mono shrink-0 text-[18px] text-muted-foreground transition-transform group-open:rotate-45">
                          +
                        </span>
                      </summary>
                      <div className="px-6 pb-5 text-[15px] leading-[1.65] text-muted-foreground">
                        {item.a}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border/70 px-8 py-[100px] text-center">
          <div className="mx-auto max-w-[600px]">
            <h2 className="font-display mb-5 text-[clamp(28px,3.5vw,42px)] font-normal leading-tight">
              Sua dúvida não estava aqui?
            </h2>
            <p className="mb-7 text-[16px] text-muted-foreground">
              Pergunta direto na demo — 30 minutos, sem deck.
            </p>
            <Link
              href="/demo"
              className="inline-block rounded-full bg-foreground px-7 py-[14px] text-[15px] font-medium text-background transition-colors hover:bg-primary"
            >
              Pedir demo
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
