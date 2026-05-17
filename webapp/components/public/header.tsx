import Link from "next/link"
import { ThemeToggle } from "@/components/dashboard/theme-toggle"

// Header compartilhado entre todas as páginas públicas (home, /demo,
// /como-funciona, /integracoes, /faq, /setup, /privacy, /terms).
// Mantém vibe Anthropic-quente em dark default + toggle pra light.
export function PublicHeader() {
  return (
    <header className="relative z-10 border-b border-border/70 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-6">
        <Link href="/" className="font-display text-[26px] font-medium tracking-tight">
          producao<span className="text-primary text-[22px]">.app</span>
        </Link>
        <nav className="hidden gap-7 text-[15px] text-muted-foreground md:flex">
          <Link href="/como-funciona" className="transition-colors hover:text-foreground">
            Como funciona
          </Link>
          <Link href="/integracoes" className="transition-colors hover:text-foreground">
            Integrações
          </Link>
          <Link href="/setup" className="transition-colors hover:text-foreground">
            Setup
          </Link>
          <Link href="/faq" className="transition-colors hover:text-foreground">
            FAQ
          </Link>
          <Link href="/#preco" className="transition-colors hover:text-foreground">
            Preço
          </Link>
          <Link href="/login" className="transition-colors hover:text-foreground">
            Entrar
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden items-center rounded-md border border-border bg-background sm:flex">
            <ThemeToggle />
          </div>
          <Link
            href="/demo"
            className="rounded-full bg-foreground px-[18px] py-[9px] text-[14px] font-medium text-background transition-colors hover:bg-primary"
          >
            Pedir demo
          </Link>
        </div>
      </div>
    </header>
  )
}
