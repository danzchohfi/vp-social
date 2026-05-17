import Link from "next/link"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-10 font-display text-[26px] font-medium tracking-tight">
        producao<span className="text-primary text-[22px]">.app</span>
      </Link>
      {children}
      <p className="mt-10 text-[13px] text-muted-foreground">
        Um produto da Vitamina Publicitária.
      </p>
    </div>
  )
}
