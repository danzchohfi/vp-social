import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { Sidebar } from "@/components/dashboard/sidebar"
import { ActiveClientBanner } from "@/components/dashboard/active-client-banner"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <ActiveClientBanner userId={session.user.id} />
        {children}
      </main>
    </div>
  )
}
