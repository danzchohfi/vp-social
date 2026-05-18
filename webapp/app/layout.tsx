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
  title: "Produção — Publicação no piloto automático pra agências",
  description:
    "Seu Notion vira o agendador. Aprova no WhatsApp do cliente e publica sozinho em todas as redes — sem agendador paralelo, sem dupla operação.",
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
  // Dark é o default do site (rotas não-whitelabel — home/login/dashboard
  // etc.). Branch via media query pra que cliente que escolheu light no
  // toggle não veja URL bar dark/site light mismatch.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F1EA" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1612" },
  ],
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
              __html: `try{var d=localStorage.getItem("vpsocial_density");if(d==="compact"||d==="comfortable")document.documentElement.dataset.density=d}catch(e){}try{if(!localStorage.getItem("__theme_reset_2026_05_18")){localStorage.removeItem("producao_theme");localStorage.setItem("__theme_reset_2026_05_18","1")}var t=localStorage.getItem("producao_theme");var p=window.location.pathname;var whiteLabel=(p==="/c"||p.indexOf("/c/")===0||p==="/a"||p.indexOf("/a/")===0||p==="/approve"||p.indexOf("/approve/")===0);if(whiteLabel){if(t==="dark")document.documentElement.classList.add("dark")}else{if(t!=="light")document.documentElement.classList.add("dark")}}catch(e){}`,
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
