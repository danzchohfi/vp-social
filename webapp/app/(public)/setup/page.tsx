import Link from "next/link"
import { PublicHeader } from "@/components/public/header"
import { PublicFooter } from "@/components/public/footer"

export const metadata = {
  title: "Setup em 5 minutos — Produção",
  description:
    "Guia público do setup: conectar Notion, mapear campos, configurar WhatsApp Business e convidar clientes. ~5 minutos pro essencial.",
}

type Step = {
  num: string
  title: string
  lead: string
  body: React.ReactNode
  visual: () => React.ReactNode
}

const STEPS: Step[] = [
  {
    num: "01",
    title: "Conectar o Notion",
    lead: "OAuth oficial · 1 clique · ~30 segundos",
    body: (
      <>
        <p className="mb-4">
          No primeiro acesso, clique em <strong>&ldquo;Conectar Notion&rdquo;</strong>.
          Você vai pro Notion, autoriza o workspace da agência (ou o que você quiser usar),
          e volta pro Produção com a integração ativa.
        </p>
        <p>
          A gente pede acesso só às databases que você selecionar — nada mais. Você pode
          revogar a qualquer momento no painel do Notion.
        </p>
      </>
    ),
    visual: OAuthVisual,
  },
  {
    num: "02",
    title: "Mapear os campos do Notion",
    lead: "Configure uma vez, vale pra todos os posts",
    body: (
      <>
        <p className="mb-4">
          Cada agência usa o Notion de um jeito diferente. A gente respeita isso —
          você diz pra cada propriedade da sua database qual é a função dela:
        </p>
        <ul className="space-y-2 text-[14px]">
          <li>
            <strong className="font-mono text-primary">Status produção</strong> —
            a coluna que diz quando o post está pronto pra produção interna
            (ex: &ldquo;Em produção&rdquo; / &ldquo;Pronto&rdquo;)
          </li>
          <li>
            <strong className="font-mono text-primary">Status publicação</strong> —
            a coluna que dispara aprovação do cliente
            (ex: &ldquo;Pronto pra aprovar&rdquo; → vai pro WhatsApp)
          </li>
          <li>
            <strong className="font-mono text-primary">Data agendada</strong> —
            quando o post vai pro ar (após aprovação)
          </li>
          <li>
            <strong className="font-mono text-primary">Conta</strong> —
            qual conta de rede social publica
            (relação com sua database de Contas/Clientes, ou Select)
          </li>
          <li>
            <strong className="font-mono text-primary">Mídia</strong> —
            arquivo de imagem / vídeo / carrossel
          </li>
          <li>
            <strong className="font-mono text-primary">Legenda</strong> —
            texto do post
          </li>
        </ul>
      </>
    ),
    visual: MappingVisual,
  },
  {
    num: "03",
    title: "Conectar contas de redes sociais",
    lead: "OAuth direto via Meta Business / Google / TikTok / LinkedIn",
    body: (
      <>
        <p className="mb-4">
          Pra cada conta que você quer publicar, conecte via OAuth oficial. A gente puxa
          a lista de páginas / contas que você tem acesso e você seleciona quais entram.
        </p>
        <p className="mb-4">
          <strong>Importante:</strong> as contas conectadas são reconhecidas pelo nome
          que você definir, e o Notion já consegue listar essas contas como opções no
          dropdown da propriedade &ldquo;Conta&rdquo; — a gente sincroniza automaticamente.
        </p>
        <p>
          Plataformas suportadas em produção:{" "}
          <strong className="font-mono">Instagram · Facebook · YouTube · TikTok · LinkedIn</strong>.
        </p>
      </>
    ),
    visual: AccountsVisual,
  },
  {
    num: "04",
    title: "Configurar o WhatsApp Business",
    lead: "Meta Cloud API · template aprovado · ~2 minutos",
    body: (
      <>
        <p className="mb-4">
          Cole o <strong>número de origem</strong> da sua WhatsApp Business (a que vai
          enviar a mensagem de aprovação pros seus clientes), o <strong>phone_number_id</strong> da Meta
          Cloud, e o <strong>nome do template</strong> aprovado.
        </p>
        <p className="mb-4">
          A gente fornece um template pré-aprovado que você pode submeter na sua WABA:{" "}
          <code className="font-mono rounded bg-muted px-2 py-0.5 text-[13px]">aprovacao_post_v2</code>
        </p>
        <p>
          Se você não tem WhatsApp Business configurado, a gente faz junto na call de
          setup white-glove (incluso no plano).
        </p>
      </>
    ),
    visual: WhatsAppVisual,
  },
  {
    num: "05",
    title: "Convidar os clientes",
    lead: "Link único por cliente · WhatsApp dele · pronto",
    body: (
      <>
        <p className="mb-4">
          Adicione cada cliente da sua agência com nome + número de WhatsApp.
          A gente gera um link único e permanente pro painel dele (white-label).
        </p>
        <p>
          O cliente vai receber a primeira mensagem de aprovação quando o próximo
          post dele tiver status &ldquo;Pronto pra aprovar&rdquo; no Notion.
        </p>
      </>
    ),
    visual: ClientsVisual,
  },
]

export default function SetupPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.35] tech-grid"
        style={{ maskImage: "radial-gradient(ellipse at center, black 20%, transparent 75%)" }}
      />
      <PublicHeader />

      <main className="relative flex-1">
        <section className="px-8 pt-[100px] pb-[60px] text-center">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px] tech-radial" />
          <div className="relative mx-auto max-w-[1180px]">
            <span className="font-mono mb-5 inline-block text-[12px] uppercase tracking-[0.12em] text-primary">
              setup · ~5 minutos
            </span>
            <h1 className="font-display mx-auto mb-6 max-w-[860px] text-[clamp(44px,6vw,84px)] font-normal leading-[1.04] tracking-tight">
              Configura uma vez.{" "}
              <em className="italic text-primary">Roda sozinho.</em>
            </h1>
            <p className="mx-auto max-w-[640px] text-[19px] leading-[1.55] text-muted-foreground">
              5 passos. Você faz sozinho, ou marca uma call white-glove de 30 minutos
              (incluso no plano) onde a gente faz junto.
            </p>
          </div>
        </section>

        <section className="px-8 py-[40px]">
          <div className="mx-auto max-w-[1180px] space-y-[80px]">
            {STEPS.map((s, i) => (
              <StepBlock key={s.num} step={s} reverse={i % 2 === 1} />
            ))}
          </div>
        </section>

        <section className="border-t border-border/70 px-8 py-[100px]">
          <div className="mx-auto max-w-[1180px]">
            <div className="rounded-[20px] border border-border bg-card/60 p-10 backdrop-blur md:p-12">
              <div className="grid gap-8 md:grid-cols-2 md:items-center">
                <div>
                  <span className="font-mono mb-3 inline-block text-[12px] uppercase tracking-[0.12em] text-primary">
                    white-glove setup
                  </span>
                  <h3 className="font-display mb-3 text-[clamp(28px,3vw,38px)] font-normal leading-tight">
                    Quer que a gente faça junto?
                  </h3>
                  <p className="text-[16px] text-muted-foreground">
                    Call de 30 minutos, tela compartilhada, a gente conecta seu
                    Notion + WhatsApp + 1 cliente real e deixa o primeiro post saindo.
                    Incluso no plano, sem cobrança adicional.
                  </p>
                </div>
                <div className="text-center md:text-right">
                  <Link
                    href="/demo"
                    className="inline-block rounded-full bg-foreground px-7 py-[14px] text-[15px] font-medium text-background transition-colors hover:bg-primary"
                  >
                    Marcar setup white-glove
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}

function StepBlock({ step, reverse }: { step: Step; reverse: boolean }) {
  const Vis = step.visual
  return (
    <div className={`grid gap-12 md:grid-cols-2 md:items-center ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}>
      <div>
        <div className="font-mono mb-3 text-[12px] uppercase tracking-[0.12em] text-primary">
          passo {step.num}
        </div>
        <h2 className="font-display mb-2 text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] tracking-tight">
          {step.title}
        </h2>
        <p className="font-display mb-5 text-[18px] italic text-muted-foreground">
          {step.lead}
        </p>
        <div className="space-y-3 text-[16px] leading-[1.65] text-muted-foreground">
          {step.body}
        </div>
      </div>
      <div className="rounded-[18px] border border-border bg-card p-6 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.3)]">
        <Vis />
      </div>
    </div>
  )
}

// ─── Visuals (variantes reusam ideias dos mockups da home) ──────

function OAuthVisual() {
  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] text-muted-foreground">
        producao.app/onboarding/notion
      </div>
      <div className="rounded-[12px] border border-border bg-background p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-foreground text-[22px] font-bold text-background">
          N
        </div>
        <div className="font-display mb-1.5 text-[16px] font-medium">Conectar Notion</div>
        <p className="mb-4 text-[12px] leading-tight text-muted-foreground">
          Autoriza o acesso ao workspace da agência.
        </p>
        <div className="rounded-full bg-foreground py-2 text-[13px] font-medium text-background">
          → autorizar workspace
        </div>
      </div>
      <div className="font-mono rounded-md border border-border bg-card px-3 py-2 text-[11px]">
        <span className="text-primary">●</span> conectado a 2 workspaces
        <span className="ml-3 text-muted-foreground">vitamina-agency, vitamina-clientes</span>
      </div>
    </div>
  )
}

function MappingVisual() {
  const fields = [
    { notion: "Status (Produção)", target: "Status produção", type: "Select" },
    { notion: "Status (Publicação)", target: "Status publicação", type: "Select" },
    { notion: "Quando publica", target: "Data agendada", type: "Date" },
    { notion: "Marca / Conta", target: "Conta", type: "Relation" },
    { notion: "Arquivos", target: "Mídia", type: "Files" },
    { notion: "Legenda", target: "Legenda", type: "Text" },
  ]
  return (
    <div className="space-y-2">
      <div className="font-mono mb-2 text-[10px] text-muted-foreground">
        mapeamento · Notion → Produção
      </div>
      {fields.map((f) => (
        <div
          key={f.notion}
          className="font-mono flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-[12px]"
        >
          <span className="flex-1 truncate text-foreground">{f.notion}</span>
          <span className="text-primary">→</span>
          <span className="text-foreground">{f.target}</span>
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {f.type}
          </span>
          <span className="text-primary">✓</span>
        </div>
      ))}
    </div>
  )
}

function AccountsVisual() {
  const accts = [
    { name: "@docelar_cafes", platform: "Instagram", status: "live" },
    { name: "Doce Lar Cafés", platform: "Facebook", status: "live" },
    { name: "@docelarcafes", platform: "TikTok", status: "live" },
    { name: "Doce Lar — Canal", platform: "YouTube", status: "live" },
    { name: "Doce Lar Cafés Co.", platform: "LinkedIn", status: "live" },
  ]
  return (
    <div className="space-y-2">
      <div className="font-mono mb-2 text-[10px] text-muted-foreground">
        contas conectadas · Doce Lar Cafés
      </div>
      {accts.map((a) => (
        <div
          key={a.name + a.platform}
          className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
        >
          <div className="font-mono w-[80px] text-[10px] uppercase tracking-wider text-primary">
            {a.platform}
          </div>
          <div className="flex-1 truncate text-[13px] font-medium">{a.name}</div>
          <span className="font-mono text-[10px] text-primary">● conectado</span>
        </div>
      ))}
    </div>
  )
}

function WhatsAppVisual() {
  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] text-muted-foreground">
        configurações · WhatsApp Business
      </div>
      <div>
        <div className="font-mono mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          número de origem
        </div>
        <div className="font-mono rounded-md border border-border bg-background px-3 py-2.5 text-[12px]">
          +55 11 99999-0000
          <span className="ml-2 text-primary">● ativo</span>
        </div>
      </div>
      <div>
        <div className="font-mono mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          phone_number_id
        </div>
        <div className="font-mono rounded-md border border-border bg-background px-3 py-2.5 text-[12px] text-muted-foreground">
          1234567890123456
        </div>
      </div>
      <div>
        <div className="font-mono mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          template aprovado
        </div>
        <div className="font-mono rounded-md border border-border bg-background px-3 py-2.5 text-[11px] leading-snug">
          <div className="text-foreground">aprovacao_post_v2</div>
          <div className="mt-1 text-muted-foreground">
            Olá {"{{1}}"}, novo post pronto pra sua aprovação: {"{{2}}"} {"{{3}}"}
          </div>
        </div>
      </div>
    </div>
  )
}

function ClientsVisual() {
  const c = [
    { initial: "D", name: "Doce Lar Cafés", phone: "+55 11 98765-4321", color: "#8B6F47" },
    { initial: "A", name: "Atelier Norte", phone: "+55 21 99876-5432", color: "#5C4A38" },
    { initial: "P", name: "Praia Solar", phone: "+55 11 91234-5678", color: "#CC785C" },
  ]
  return (
    <div className="space-y-2">
      <div className="font-mono mb-2 text-[10px] text-muted-foreground">
        clientes da agência · 3 / 5 inclusos
      </div>
      {c.map((cl) => (
        <div key={cl.name} className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded text-[12px] font-bold text-background"
            style={{ background: cl.color }}
          >
            {cl.initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{cl.name}</div>
            <div className="font-mono truncate text-[11px] text-muted-foreground">{cl.phone}</div>
          </div>
          <span className="font-mono shrink-0 text-[10px] text-primary">● ativo</span>
        </div>
      ))}
      <div className="font-mono rounded-md border border-dashed border-border px-3 py-2.5 text-center text-[12px] text-muted-foreground">
        + adicionar cliente
      </div>
    </div>
  )
}
