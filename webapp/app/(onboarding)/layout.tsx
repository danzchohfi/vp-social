import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { Zap } from "lucide-react"
import Link from "next/link"

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="flex h-16 items-center border-b bg-background px-6">
        <Link href="/dashboard" className="flex items-center gap-2 transition-opacity hover:opacity-80" aria-label="Ir para o Dashboard">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-xl tracking-tight">
            <span className="font-semibold">VP</span>
            <span className="ml-1 italic font-display">Social</span>
          </span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        {children}
      </main>
    </div>
  )
}
