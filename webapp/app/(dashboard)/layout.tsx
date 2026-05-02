import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { Sidebar } from "@/components/dashboard/sidebar"
import { MobileNav } from "@/components/dashboard/mobile-nav"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-background md:h-screen md:overflow-hidden">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden pt-14 pb-[calc(4rem+env(safe-area-inset-bottom))] md:overflow-y-auto md:pt-0 md:pb-0">
        {children}
      </main>
      <MobileNav />
    </div>
  )
}
