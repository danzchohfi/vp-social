import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Toaster } from "sonner"
import NextTopLoader from "nextjs-toploader"
import { ViewTransitions } from "next-view-transitions"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "VP Social — Publique do Notion para as redes sociais",
  description: "Gerencie e publique conteúdo das suas redes sociais diretamente do Notion.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VP Social",
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
  themeColor: "#0a0a0a",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransitions>
      <html lang="pt-BR" className="dark" suppressHydrationWarning>
        <head>
          <meta name="tiktok-developers-site-verification" content="eiekVsERmEwyEjPJ4DNBxmDXYZrilQ3Q" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
            rel="stylesheet"
          />
          {/* Aplica preferência de densidade ANTES da hydratação pra evitar
              flash em page load. Síncrono, ~80 bytes, sem deps. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `try{var d=localStorage.getItem("vpsocial_density");if(d==="compact"||d==="comfortable")document.documentElement.dataset.density=d}catch(e){}`,
            }}
          />
        </head>
        <body className={`${geist.variable} ${geistMono.variable} font-[family-name:var(--font-geist)] antialiased`}>
          <NextTopLoader
            color="oklch(0.72 0.18 285)"
            height={3}
            showSpinner={false}
            shadow="0 0 10px oklch(0.72 0.18 285 / 0.6), 0 0 5px oklch(0.72 0.18 285 / 0.6)"
          />
          {children}
          <Toaster richColors position="top-right" />
        </body>
      </html>
    </ViewTransitions>
  )
}
