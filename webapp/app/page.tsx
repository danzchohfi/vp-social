import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight, Zap, LayoutDashboard, Instagram, Link2,
  CheckCircle2, Sparkles, Users, BarChart3
} from "lucide-react"

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">VP Social</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <Link href="#features" className="hover:text-foreground transition-colors">Funcionalidades</Link>
            <Link href="#how" className="hover:text-foreground transition-colors">Como funciona</Link>
            <Link href="#pricing" className="hover:text-foreground transition-colors">Preços</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Entrar</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Começar grátis <ArrowRight /></Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden px-6 py-24 text-center md:py-36">
          <div className="absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
          </div>
          <div className="mx-auto max-w-4xl">
            <Badge variant="secondary" className="mb-6 gap-1.5">
              <Sparkles className="h-3 w-3" />
              Feito para agências e criadores
            </Badge>
            <h1 className="mb-6 text-5xl font-bold tracking-tight md:text-7xl">
              Publique no Instagram
              <br />
              <span className="text-primary">direto do Notion</span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground md:text-xl">
              Gerencie o calendário editorial dos seus clientes no Notion e publique automaticamente
              nas redes sociais. Sem copiar e colar. Sem esquecimentos.
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button size="xl" asChild>
                <Link href="/signup">
                  Começar gratuitamente <ArrowRight />
                </Link>
              </Button>
              <Button size="xl" variant="outline" asChild>
                <Link href="#how">Ver como funciona</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Grátis para começar · Sem cartão de crédito</p>
          </div>
        </section>

        {/* Social proof */}
        <section className="border-y border-border/50 bg-muted/30 px-6 py-12">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-8 text-sm font-medium text-muted-foreground uppercase tracking-widest">
              Funciona com suas ferramentas favoritas
            </p>
            <div className="flex flex-wrap items-center justify-center gap-12 text-muted-foreground">
              {["Notion", "Instagram", "Facebook", "Reels", "Carrossel"].map((tool) => (
                <span key={tool} className="text-lg font-semibold">{tool}</span>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-4xl font-bold tracking-tight">Tudo que você precisa</h2>
              <p className="text-lg text-muted-foreground">Uma plataforma completa para gestão de redes sociais</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="group rounded-2xl border bg-card p-6 transition-shadow hover:shadow-md">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="bg-muted/30 px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-4xl font-bold tracking-tight">Como funciona</h2>
              <p className="text-lg text-muted-foreground">Configuração em minutos, publicação automática para sempre</p>
            </div>
            <div className="space-y-8">
              {steps.map((step, i) => (
                <div key={step.title} className="flex gap-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                    {i + 1}
                  </div>
                  <div className="pt-2">
                    <h3 className="mb-1 font-semibold text-lg">{step.title}</h3>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="px-6 py-24">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="mb-4 text-4xl font-bold tracking-tight">Preços simples</h2>
            <p className="mb-12 text-lg text-muted-foreground">Comece grátis, escale quando precisar</p>
            <div className="grid gap-6 md:grid-cols-2">
              {plans.map((plan) => (
                <div key={plan.name} className={`rounded-2xl border p-8 text-left ${plan.featured ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card"}`}>
                  {plan.featured && <Badge className="mb-4">Mais popular</Badge>}
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <div className="my-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
                  </div>
                  <p className="mb-6 text-muted-foreground">{plan.description}</p>
                  <ul className="mb-8 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button variant={plan.featured ? "default" : "outline"} className="w-full" asChild>
                    <Link href="/signup">{plan.cta}</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-primary px-6 py-24 text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-4 text-4xl font-bold tracking-tight text-primary-foreground">
              Pronto para automatizar?
            </h2>
            <p className="mb-8 text-lg text-primary-foreground/80">
              Junte-se a agências que já economizam horas toda semana.
            </p>
            <Button size="xl" variant="secondary" asChild>
              <Link href="/signup">Criar conta grátis <ArrowRight /></Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <Zap className="h-3 w-3 text-primary-foreground" />
            </div>
            <span>VP Social</span>
          </div>
          <p>© 2026 VP Social. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  )
}

const features = [
  { icon: Link2, title: "Conecte o Notion", description: "Vincule seu banco de dados do Notion em segundos. Suporte a qualquer estrutura de database." },
  { icon: Instagram, title: "Multi-conta Instagram", description: "Gerencie múltiplos clientes e contas Instagram em uma única plataforma." },
  { icon: Zap, title: "Publicação automática", description: "Defina o status como 'Agendamento' no Notion e o VP Social publica automaticamente." },
  { icon: LayoutDashboard, title: "Dashboard completo", description: "Visualize todos os posts agendados, publicados e com erro em tempo real." },
  { icon: Users, title: "Feito para agências", description: "Estrutura multi-cliente. Cada cliente com suas próprias contas e configurações." },
  { icon: BarChart3, title: "Histórico completo", description: "Registro detalhado de todas as publicações com status e mensagens de erro." },
]

const steps = [
  { title: "Crie sua conta", description: "Cadastre-se com e-mail ou faça login com o Facebook diretamente." },
  { title: "Conecte o Notion", description: "Autorize o acesso ao seu workspace e selecione o banco de dados de conteúdo." },
  { title: "Conecte o Instagram", description: "Faça login com o Facebook e selecione as contas Instagram dos seus clientes." },
  { title: "Configure os campos", description: "Mapeie as colunas do Notion para legenda, imagem, data e conta." },
  { title: "Publique automaticamente", description: "Mude o status para 'Agendamento' no Notion e o VP Social faz o resto." },
]

const plans = [
  {
    name: "Grátis",
    price: "R$0",
    period: "/mês",
    description: "Para testar e começar pequeno.",
    features: ["1 conta Instagram", "1 banco de dados Notion", "50 posts/mês", "Suporte por e-mail"],
    cta: "Começar grátis",
    featured: false,
  },
  {
    name: "Agência",
    price: "R$97",
    period: "/mês",
    description: "Para agências que gerenciam múltiplos clientes.",
    features: ["Contas Instagram ilimitadas", "Bancos de dados ilimitados", "Posts ilimitados", "Histórico completo", "Suporte prioritário"],
    cta: "Começar agora",
    featured: true,
  },
]
