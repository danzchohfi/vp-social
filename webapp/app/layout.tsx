import type { Metadata, Viewport } from "next"
import { Fraunces, Inter, Geist_Mono } from "next/font/google"
import { Toaster } from "sonner"
import NextTopLoader from "nextjs-toploader"
import { ViewTransitions } from "next-view-transitions"
import { headers } from "next/headers"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Produção — O painel de experiência do cliente pra agências",
  description:
    "Mais conteúdo publicado. Menos esforço pra todo mundo. Plugado no que sua agência já usa.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Produção",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F5F1EA",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce CSP por request — gerado pelo middleware.
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <ViewTransitions>
      <html lang="pt-BR" suppressHydrationWarning>
        <head>
          <meta
            name="tiktok-developers-site-verification"
            content="eiekVsERmEwyEjPJ4DNBxmDXYZrilQ3Q"
          />
          {/* Aplica preferência de densidade + tema ANTES da hydratação pra
              evitar flash em page load. Tema: dark é default em rotas
              internas (dashboard, settings, productions...); light é
              default em rotas públicas (home, login, signup, portal
              cliente). Usuário pode override via toggle no dashboard. */}
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `try{var d=localStorage.getItem("vpsocial_density");if(d==="compact"||d==="comfortable")document.documentElement.dataset.density=d}catch(e){}try{var t=localStorage.getItem("producao_theme");if(t==="dark"){document.documentElement.classList.add("dark")}else if(t!=="light"){var p=window.location.pathname;var r=["/dashboard","/settings","/productions","/scheduled","/history","/clients","/accounts","/account","/activity","/approvers","/grid","/health","/onboarding","/invites","/posts","/test-approval"];if(r.some(function(x){return p===x||p.indexOf(x+"/")===0}))document.documentElement.classList.add("dark")}}catch(e){}`,
            }}
          />
        </head>
        <body
          className={`${inter.variable} ${fraunces.variable} ${geistMono.variable} font-sans antialiased`}
        >
          <NextTopLoader
            color="oklch(0.65 0.13 40)"
            height={3}
            showSpinner={false}
            shadow="0 0 10px oklch(0.65 0.13 40 / 0.5)"
          />
          {children}
          <Toaster richColors position="top-right" theme="light" />
        </body>
      </html>
    </ViewTransitions>
  )
}
