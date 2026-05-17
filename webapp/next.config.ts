import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
    ],
  },
  async headers() {
    // Headers estáticos (não-dinâmicos). CSP vem do middleware.ts porque
    // precisa de nonce per-request. Aqui ficam só os que não mudam.
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
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
