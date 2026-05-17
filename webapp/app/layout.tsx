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
          {/* Aplica preferência de densidade ANTES da hydratação pra evitar
              flash em page load. */}
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `try{var d=localStorage.getItem("vpsocial_density");if(d==="compact"||d==="comfortable")document.documentElement.dataset.density=d}catch(e){}`,
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
