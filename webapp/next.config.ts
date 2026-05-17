import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
    ],
  },
  async headers() {
    // Cabeçalhos de segurança aplicados em todas as rotas.
    // - X-Frame-Options + CSP frame-ancestors: anti-clickjacking. Páginas
    //   públicas (/c/[token], /approve/[token]) NÃO podem ser embarcadas
    //   em iframe por terceiros — alguém com link de aprovação não pode
    //   ser enganado por iframe transparente.
    // - HSTS: força HTTPS por 2 anos. Vercel já serve HTTPS, isso protege
    //   contra downgrade.
    // - nosniff: previne MIME confusion.
    // - Referrer-Policy: não vaza paths internos cross-origin.
    // CSP completo (com script-src etc) fica pra depois — exige nonces
    // pelo Next.js inline script + testes em produção.
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
    ]
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          ...securityHeaders,
        ],
      },
    ]
  },
}

export default nextConfig
