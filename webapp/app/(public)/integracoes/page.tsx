import Link from "next/link"
import { PublicHeader } from "@/components/public/header"
import { PublicFooter } from "@/components/public/footer"

export const metadata = {
  title: "Integrações — Produção",
  description:
    "Notion, Sheets, Trello, Asana, Airtable, WhatsApp, Instagram, Facebook, YouTube, TikTok, LinkedIn. APIs oficiais, OAuth 2.0, webhooks em tempo real.",
}

type Integration = {
  name: string
  desc: string
  status: "live" | "soon" | "roadmap"
  details: string
  oauth?: boolean
  webhooks?: boolean
}

const PLANNING: Integration[] = [
  { name: "Notion", desc: "Workspace integration via OAuth oficial", status: "live", details: "Lê databases existentes, qualquer estrutura. Sync de status, mídia, agendamento.", oauth: true, webhooks: true },
  { name: "Google Sheets", desc: "Planilhas com mapeamento de colunas", status: "soon", details: "Mesma lógica do Notion: mapeia colunas, lê linhas, escuta mudanças.", oauth: true },
  { name: "Trello", desc: "Cards como posts, listas como status", status: "roadmap", details: "Por demanda. Fala com a gente se for prioridade.", oauth: true },
  { name: "Asana", desc: "Tasks como posts, sections como status", status: "roadmap", details: "Por demanda. Fala com a gente se for prioridade.", oauth: true },
  { name: "Airtable", desc: "Bases multi-tabela com filtros", status: "roadmap", details: "Por demanda. Fala com a gente se for prioridade.", oauth: true },
]

const CHANNELS: Integration[] = [
  { name: "WhatsApp Business", desc: "Meta Cloud API · template oficial aprovado", status: "live", details: "Mensagens transacionais via WABA própria. Templates pré-aprovados pela Meta. Anti-spam.", oauth: true, webhooks: true },
  { name: "E-mail", desc: "Aprovação por link único via Resend", status: "soon", details: "Pro mercado internacional onde WhatsApp não é dominante.", oauth: false },
  { name: "Slack", desc: "Bot que posta no canal #aprovação", status: "roadmap", details: "Útil pra times do cliente que vivem em Slack.", oauth: true },
]

const PUBLISHING: Integration[] = [
  { name: "Instagram", desc: "Feed, Carrossel, Reels, Stories via Graph API", status: "live", details: "Graph API oficial via Facebook Business. Conta business obrigatória.", oauth: true, webhooks: false },
  { name: "Facebook", desc: "Posts em Page via Graph API", status: "live", details: "Posts simples, imagens, vídeos, link share. Página business.", oauth: true, webhooks: false },
  { name: "YouTube", desc: "Upload de vídeos com privacidade configurável", status: "live", details: "YouTube Data API v3. Resumable upload. Scope youtube.upload.", oauth: true, webhooks: false },
  { name: "TikTok", desc: "Content Posting API via TikTok Developers", status: "live", details: "Direct Post + Inbox modes. Captação de scope explícita.", oauth: true, webhooks: false },
  { name: "LinkedIn", desc: "Posts em página corporativa via Marketing API", status: "live", details: "Posts em página (não pessoal). Approval flow LinkedIn.", oauth: true, webhooks: false },
]

export default function IntegracoesPage() {
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
              integrações
            </span>
            <h1 className="font-display mx-auto mb-6 max-w-[860px] text-[clamp(44px,6vw,84px)] font-normal leading-[1.04] tracking-tight">
              Conecta com tudo que sua{" "}
              <em className="italic text-primary">agência já usa</em>.
            </h1>
            <p className="mx-auto max-w-[620px] text-[19px] leading-[1.55] text-muted-foreground">
              APIs oficiais. OAuth 2.0. Webhooks em tempo real onde possível.
              Sem scraping, sem hack, sem risco de banimento de conta.
            </p>
            <div className="font-mono mt-8 flex justify-center gap-6 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <span><span className="text-primary">●</span> em produção</span>
              <span><span className="text-primary/60">◐</span> próximas 8 semanas</span>
              <span><span className="text-muted-foreground/40">○</span> roadmap aberto</span>
            </div>
          </div>
        </section>

        <section className="px-8 py-[60px]">
          <div className="mx-auto max-w-[1180px] space-y-[80px]">
            <IntegrationGroup title="Planning" lead="Onde sua agência organiza conteúdo" items={PLANNING} />
            <IntegrationGroup title="Canais do cliente" lead="Onde o cliente final aprova" items={CHANNELS} />
            <IntegrationGroup title="Publicação" lead="Onde o conteúdo sai" items={PUBLISHING} />
          </div>
        </section>

        <section className="border-t border-border/70 px-8 py-[100px]">
          <div className="mx-auto max-w-[1180px]">
            <div className="rounded-[20px] border border-border bg-card/60 p-10 text-center backdrop-blur">
              <h3 className="font-display mb-3 text-[clamp(28px,3vw,38px)] font-normal leading-tight">
                Falta uma integração que você precisa?
              </h3>
              <p className="mx-auto mb-7 max-w-[480px] text-[16px] text-muted-foreground">
                A gente prioriza roadmap por demanda. Fala com a gente — se 3 agências pedem, a gente constrói.
              </p>
              <Link
                href="/demo"
                className="inline-block rounded-full bg-foreground px-7 py-[14px] text-[15px] font-medium text-background transition-colors hover:bg-primary"
              >
                Pedir integração nova
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}

function IntegrationGroup({ title, lead, items }: { title: string; lead: string; items: Integration[] }) {
  return (
    <div>
      <div className="mb-8">
        <h2 className="font-display mb-2 text-[clamp(28px,3.5vw,42px)] font-normal leading-tight">
          {title}
        </h2>
        <p className="text-[16px] text-muted-foreground">{lead}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => <IntegrationCard key={i.name} i={i} />)}
      </div>
    </div>
  )
}

function IntegrationCard({ i }: { i: Integration }) {
  const statusColor =
    i.status === "live" ? "text-primary" :
    i.status === "soon" ? "text-primary/60" :
    "text-muted-foreground/50"
  const statusLabel =
    i.status === "live" ? "● em produção" :
    i.status === "soon" ? "◐ próximas 8 semanas" :
    "○ roadmap"
  const opacity = i.status === "roadmap" ? "opacity-70" : ""
  return (
    <div className={`flex flex-col rounded-[14px] border border-border bg-card p-6 ${opacity}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="font-display text-[20px] font-medium leading-tight">{i.name}</h3>
        <span className={`font-mono shrink-0 text-[10px] uppercase tracking-wider ${statusColor}`}>
          {statusLabel}
        </span>
      </div>
      <p className="font-mono mb-4 text-[12px] text-muted-foreground">{i.desc}</p>
      <p className="mb-4 flex-1 text-[14px] leading-[1.5] text-muted-foreground">{i.details}</p>
      <div className="flex flex-wrap gap-1.5">
        {i.oauth && <TechPill>OAuth 2.0</TechPill>}
        {i.webhooks && <TechPill>Webhooks</TechPill>}
        {!i.oauth && !i.webhooks && <TechPill>Server-to-server</TechPill>}
      </div>
    </div>
  )
}

function TechPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono rounded-md border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
      {children}
    </span>
  )
}
