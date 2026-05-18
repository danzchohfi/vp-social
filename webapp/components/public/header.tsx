"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { ThemeToggle } from "@/components/dashboard/theme-toggle"

// Header compartilhado entre todas as páginas públicas (home, /demo,
// /como-funciona, /integracoes, /faq, /setup, /privacy, /terms).
// Mobile: hamburger abre overlay fullscreen com nav vertical + theme
// toggle + CTA. Antes só mostrava logo + "Pedir demo" em mobile —
// sem entrar, sem navegar (todos os Links viviam em hidden md:flex).

const NAV = [
  { href: "/como-funciona", label: "Como funciona" },
  { href: "/integracoes", label: "Integrações" },
  { href: "/setup", label: "Setup" },
  { href: "/faq", label: "FAQ" },
  { href: "/#preco", label: "Preço" },
] as const

export function PublicHeader() {
  const [open, setOpen] = useState(false)

  // Trava scroll do body quando menu aberto + fecha em resize pra desktop.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onResize() {
      if (window.innerWidth >= 768) setOpen(false)
    }
    window.addEventListener("resize", onResize)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("resize", onResize)
    }
  }, [open])

  return (
    <header className="relative z-40 border-b border-border/70 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-5 py-5 sm:px-8 sm:py-6">
        <Link
          href="/"
          className="font-display text-[22px] font-medium tracking-tight sm:text-[26px]"
          onClick={() => setOpen(false)}
        >
          producao<span className="text-primary text-[18px] sm:text-[22px]">.app</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden gap-7 text-[15px] text-muted-foreground md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-foreground">
              {item.label}
            </Link>
          ))}
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
            className="hidden rounded-full bg-foreground px-[18px] py-[9px] text-[14px] font-medium text-background transition-colors hover:bg-primary sm:inline-block"
          >
            Pedir demo
          </Link>

          {/* Hamburger — só mobile */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background/60 text-foreground md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Mobile overlay — z-50 fica acima do header (z-40) e de qualquer
          conteúdo da página. Click no logo ou link fecha. */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-5">
            <Link
              href="/"
              className="font-display text-[22px] font-medium tracking-tight"
              onClick={() => setOpen(false)}
            >
              producao<span className="text-primary text-[18px]">.app</span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-5 py-7">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 font-display text-[22px] font-normal leading-tight text-foreground transition-colors hover:bg-muted"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 font-display text-[22px] font-normal leading-tight text-foreground transition-colors hover:bg-muted"
            >
              Entrar
            </Link>
          </nav>

          <div className="border-t border-border/70 px-5 py-5">
            <Link
              href="/demo"
              onClick={() => setOpen(false)}
              className="block w-full rounded-full bg-foreground px-6 py-3.5 text-center text-[15px] font-medium text-background transition-colors hover:bg-primary"
            >
              Pedir demo
            </Link>
            <div className="mt-4 flex items-center justify-between text-[13px] text-muted-foreground">
              <span className="font-mono uppercase tracking-[0.12em]">tema</span>
              <div className="flex items-center rounded-md border border-border bg-background">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
