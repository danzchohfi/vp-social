import Link from "next/link"

export function PublicFooter() {
  return (
    <footer className="relative border-t border-border/70 bg-card/30 px-8 py-12">
      <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-6 sm:flex-row sm:items-start">
        <div className="max-w-[280px]">
          <div className="font-display text-[20px] font-medium">
            producao<span className="text-primary">.app</span>
          </div>
          <p className="font-mono mt-2 text-[12px] leading-relaxed text-muted-foreground">
            O painel de experiência do cliente pra agências de mídia social.
          </p>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Um produto da Vitamina Publicitária.<br />
            São Paulo · 2026.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3">
          <div>
            <div className="font-mono mb-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              produto
            </div>
            <nav className="flex flex-col gap-2 text-[14px]">
              <Link href="/como-funciona" className="text-foreground/80 hover:text-foreground">
                Como funciona
              </Link>
              <Link href="/integracoes" className="text-foreground/80 hover:text-foreground">
                Integrações
              </Link>
              <Link href="/setup" className="text-foreground/80 hover:text-foreground">
                Setup
              </Link>
              <Link href="/#preco" className="text-foreground/80 hover:text-foreground">
                Preço
              </Link>
            </nav>
          </div>
          <div>
            <div className="font-mono mb-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              suporte
            </div>
            <nav className="flex flex-col gap-2 text-[14px]">
              <Link href="/faq" className="text-foreground/80 hover:text-foreground">
                Perguntas frequentes
              </Link>
              <Link href="/demo" className="text-foreground/80 hover:text-foreground">
                Pedir demo
              </Link>
              <Link href="/login" className="text-foreground/80 hover:text-foreground">
                Entrar
              </Link>
            </nav>
          </div>
          <div>
            <div className="font-mono mb-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              legal
            </div>
            <nav className="flex flex-col gap-2 text-[14px]">
              <Link href="/terms" className="text-foreground/80 hover:text-foreground">
                Termos
              </Link>
              <Link href="/privacy" className="text-foreground/80 hover:text-foreground">
                Privacidade
              </Link>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  )
}
