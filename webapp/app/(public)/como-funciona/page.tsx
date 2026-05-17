import Link from "next/link"
import { PublicHeader } from "@/components/public/header"
import { PublicFooter } from "@/components/public/footer"

export const metadata = {
  title: "Como funciona — Produção",
  description:
    "Do planejamento no Notion à publicação automática, passando pela aprovação no WhatsApp do cliente. Veja o fluxo completo do Produção.",
}

export default function ComoFuncionaPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.35] tech-grid"
        style={{ maskImage: "radial-gradient(ellipse at center, black 20%, transparent 75%)" }}
      />
      <PublicHeader />

      <main className="relative flex-1">
        {/* Hero */}
        <section className="px-8 pt-[100px] pb-[60px] text-center">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px] tech-radial" />
          <div className="relative mx-auto max-w-[1180px]">
            <span className="font-mono mb-5 inline-block text-[12px] uppercase tracking-[0.12em] text-primary">
              como funciona · end-to-end
            </span>
            <h1 className="font-display mx-auto mb-6 max-w-[860px] text-[clamp(44px,6vw,84px)] font-normal leading-[1.04] tracking-tight">
              Do Notion ao feed.{" "}
              <em className="italic text-primary">Sem agência tocar em nada.</em>
            </h1>
            <p className="mx-auto max-w-[620px] text-[19px] leading-[1.55] text-muted-foreground">
              Quatro etapas. Roda por trás. O cliente da sua agência só vê o
              resultado — um painel premium e posts saindo no prazo.
            </p>
          </div>
        </section>

        {/* 4 stages */}
        <section className="px-8 py-[60px]">
          <div className="mx-auto max-w-[1180px] space-y-[80px]">
            {STAGES.map((s, i) => (
              <Stage key={s.title} stage={s} index={i + 1} reverse={i % 2 === 1} />
            ))}
          </div>
        </section>

        {/* End */}
        <section className="border-t border-border/70 px-8 py-[120px] text-center">
          <div className="mx-auto max-w-[1180px]">
            <h2 className="font-display mx-auto mb-6 max-w-[700px] text-[clamp(36px,4.5vw,56px)] font-normal leading-[1.08] tracking-tight">
              Quer ver rodando <em className="italic text-primary">na sua agência?</em>
            </h2>
            <p className="mx-auto mb-9 max-w-[520px] text-[17px] text-muted-foreground">
              30 minutos, tela compartilhada, sem deck. Se não fizer sentido, você sai em 5 minutos.
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

type StageDef = {
  title: string
  lead: string
  body: string
  bullets: string[]
  visual: () => React.ReactNode
}

const STAGES: StageDef[] = [
  {
    title: "Planejamento continua no Notion",
    lead: "Onde sua agência já organiza tudo.",
    body:
      "Conecta o workspace do Notion via OAuth oficial. A gente lê as databases que você já tem — calendário editorial, mídia, status. Sem migrar nada, sem ferramenta nova pra ninguém aprender. Mapeia 5 campos uma vez e pronto.",
    bullets: [
      "Suporte a qualquer estrutura de database",
      "Mapeamento de status produção / status publicação / contas / mídia / legenda",
      "Roadmap: Sheets, Trello, Asana, Airtable (próximas 8 semanas)",
    ],
    visual: NotionVisual,
  },
  {
    title: "Aprovação vai pro WhatsApp do cliente",
    lead: "Onde o cliente já vive.",
    body:
      "Quando o status muda pra 'Pronto pra aprovar' no seu Notion, a gente dispara uma mensagem oficial via WhatsApp Business API (Meta Cloud) pro cliente final. Template aprovado, link único, anti-spam, com TTL de 30 dias.",
    bullets: [
      "WhatsApp Business via Meta Cloud API oficial",
      "Cadeia de aprovadores reutilizáveis (aprovador 1 → 2 → 3)",
      "Aprovação tácita: silêncio em 30d = aprovado. Você nunca fica refém.",
    ],
    visual: WhatsappVisual,
  },
  {
    title: "Cliente abre o painel da sua agência",
    lead: "White-label real. Marca dela, no celular dele.",
    body:
      "O link do WhatsApp abre num painel premium com a cor, logo e fonte da SUA agência. Zero 'powered by Produção'. O cliente desliza pra aprovar, comenta pra pedir ajuste, vê posts publicados com métricas, abre briefing, próxima reunião, status mensal.",
    bullets: [
      "White-label total: cliente nunca vê 'Produção'",
      "Slide-to-approve com microinterações premium",
      "Áudio do WhatsApp embed direto no card (feedback rápido)",
      "Mobile-first impecável + PWA com notificação push",
    ],
    visual: PainelVisual,
  },
  {
    title: "Publicação automática em todas as redes",
    lead: "Aprovou? Sai. Toda vez.",
    body:
      "Assim que o cliente aprova, a gente agenda a publicação no horário combinado em todas as plataformas configuradas: Instagram, Facebook, YouTube, TikTok, LinkedIn. Tudo via API oficial, com retry automático, atomic claim, audit log completo. Você não toca em nada.",
    bullets: [
      "5 plataformas: IG, FB, YT, TT, LinkedIn",
      "Retry exponencial em falha de API",
      "Atomic claim: zero double-post mesmo em concorrência",
      "Trilha completa por post (quem aprovou, quando, de qual dispositivo)",
    ],
    visual: PublishVisual,
  },
]

function Stage({ stage, index, reverse }: { stage: StageDef; index: number; reverse: boolean }) {
  const Vis = stage.visual
  return (
    <div className={`grid gap-12 md:grid-cols-2 md:items-center ${reverse ? "md:[&>*:first-child]:order-2" : ""}`}>
      <div>
        <div className="font-mono mb-4 text-[12px] uppercase tracking-[0.12em] text-primary">
          etapa {String(index).padStart(2, "0")}
        </div>
        <h2 className="font-display mb-3 text-[clamp(32px,4vw,48px)] font-normal leading-[1.1] tracking-tight">
          {stage.title}
        </h2>
        <p className="font-display mb-5 text-[20px] italic text-muted-foreground">
          {stage.lead}
        </p>
        <p className="mb-6 text-[16px] leading-[1.65] text-muted-foreground">
          {stage.body}
        </p>
        <ul className="space-y-2.5 text-[15px]">
          {stage.bullets.map((b) => (
            <li key={b} className="flex items-start gap-3">
              <span className="mt-[8px] block h-[5px] w-[5px] shrink-0 rounded-full bg-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-[18px] border border-border bg-card p-6 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.3)]">
        <Vis />
      </div>
    </div>
  )
}

// ─── Visuals ──────────────────────────────────────────────────────

function NotionVisual() {
  return (
    <div className="font-mono space-y-2 text-[12px]">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        notion.so/agencia/calendario-editorial
      </div>
      {[
        { date: "22 mai", title: "Carrossel · Lançamento Café Outono", status: "Pronto pra aprovar", color: "text-primary" },
        { date: "23 mai", title: "Reel · Latte art em 30s", status: "Em produção", color: "text-muted-foreground" },
        { date: "24 mai", title: "Story · Sábado música ao vivo", status: "Em ideação", color: "text-muted-foreground" },
        { date: "25 mai", title: "Carrossel · 3 dicas pro café gelado", status: "Pronto pra aprovar", color: "text-primary" },
      ].map((p) => (
        <div key={p.title} className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
          <span className="text-muted-foreground/70 w-12 text-[11px]">{p.date}</span>
          <span className="flex-1 truncate text-foreground">{p.title}</span>
          <span className={`rounded px-2 py-0.5 text-[10px] ${p.color === "text-primary" ? "bg-primary/10" : "bg-muted"} ${p.color}`}>
            {p.status}
          </span>
        </div>
      ))}
    </div>
  )
}

function WhatsappVisual() {
  return (
    <div className="overflow-hidden rounded-[16px] bg-[#ECE5DD] p-4">
      <div className="font-mono mb-2 text-center text-[10px] text-[#7C8693]">
        hoje 14:32
      </div>
      <div className="ml-auto max-w-[88%] rounded-lg rounded-tr-sm bg-[#DCF8C6] p-3 shadow-sm">
        <p className="text-[13px] leading-snug text-[#303030]">
          Oi Daniel, novo post pronto pra sua aprovação:
          <br />
          <span className="font-medium">&ldquo;Carrossel · Lançamento Café Outono&rdquo;</span>
        </p>
        <div className="font-mono mt-2 truncate rounded bg-white/60 px-2 py-1.5 text-[11px] text-[#1F6FB3] underline">
          vitaminapublicitaria.com/painel/...
        </div>
        <div className="mt-2 flex justify-end gap-1 text-[10px] text-[#7C8693]">
          <span>14:32</span><span className="text-[#34B7F1]">✓✓</span>
        </div>
      </div>
      <div className="font-mono mt-3 text-center text-[10px] text-[#7C8693]">
        meta cloud api · template oficial aprovado
      </div>
    </div>
  )
}

function PainelVisual() {
  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-foreground text-[12px] font-bold text-background">
          V
        </div>
        <div className="text-[12px] leading-tight">
          <div className="font-medium">Vitamina Publicitária</div>
          <div className="font-mono text-[10px] text-muted-foreground">painel · Doce Lar</div>
        </div>
      </div>
      <div className="p-4">
        <div className="font-mono mb-2 text-[10px] uppercase tracking-wider text-primary">
          próximo pra aprovar
        </div>
        <div className="font-display mb-3 text-[16px] font-medium leading-tight">
          Carrossel · Lançamento Café Outono
        </div>
        <div className="mb-3 grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-square rounded"
              style={{
                background: `linear-gradient(135deg, hsl(${20 + i * 8} 50% 70%), hsl(${30 + i * 8} 40% 60%))`,
              }}
            />
          ))}
        </div>
        <div className="rounded-full bg-foreground py-2 text-center text-[12px] font-medium text-background">
          → deslize pra aprovar
        </div>
      </div>
    </div>
  )
}

function PublishVisual() {
  const platforms = [
    { name: "Instagram", time: "08:30", status: "publicado" },
    { name: "Facebook", time: "08:30", status: "publicado" },
    { name: "TikTok", time: "12:00", status: "agendado" },
    { name: "YouTube", time: "—", status: "skip" },
    { name: "LinkedIn", time: "—", status: "skip" },
  ]
  return (
    <div className="font-mono space-y-1.5 text-[12px]">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        publicação · Carrossel Café Outono
      </div>
      {platforms.map((p) => (
        <div key={p.name} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
          <span className="text-foreground">{p.name}</span>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground/70">{p.time}</span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] ${
                p.status === "publicado"
                  ? "bg-primary/10 text-primary"
                  : p.status === "agendado"
                  ? "bg-muted text-foreground"
                  : "bg-muted/40 text-muted-foreground/60"
              }`}
            >
              {p.status === "publicado" ? "✓ no ar" : p.status === "agendado" ? "agendado" : "—"}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
