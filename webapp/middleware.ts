import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// /invites + /api/invites são públicos pra um convidado não-logado
// abrir a página de accept (a API call interna também passa por aqui).
// Mesma razão pra /approve + /api/approve (aprovação per-post que o
// cliente abre via WhatsApp, sem login), /c + /api/c (calendário
// público permanente do cliente, lista de pendentes/agendados/publicados,
// acessado via URL tokenizada que agência compartilha) e /a + /api/a
// (portal magic-link do approver — single token unifica posts +
// produções pra um aprovador individual, sem login).
const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/api/auth", "/api/tiktok-proxy", "/privacy", "/terms", "/invites", "/api/invites", "/approve", "/api/approve", "/c", "/api/c", "/a", "/api/a", "/demo", "/api/demo", "/como-funciona", "/integracoes", "/faq", "/setup"]

// Conteúdo que a CSP pode permitir além de 'self':
//   - YouTube embed nas páginas de approve/c (preview unlisted)
//   - Notion CDN pros assets de mídia (img-src, media-src)
//   - Fonts da Google (preconnect)
//   - Vercel insights (live preview, analytics)
function buildCSP(nonce: string): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next.js precisa 'unsafe-inline' pros styles dele OU usar nonce — usar
    // o mesmo nonce + style-src-elem. unsafe-inline em style é menos
    // perigoso que em script (CSS injection é rare).
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // Permite scripts carregados via script com nonce (TopLoader,
      // ViewTransitions etc) sem precisar nonce em cada um.
    ],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://*.fbcdn.net",
      "https://*.cdninstagram.com",
      "https://prod-files-secure.s3.us-west-2.amazonaws.com",
      "https://s3.us-west-2.amazonaws.com",
      "https://img.youtube.com",
      "https://i.ytimg.com",
      "https://*.googleusercontent.com",
      "https://*.notion.so",
      "https://images.unsplash.com",
    ],
    "media-src": [
      "'self'",
      "blob:",
      "https://prod-files-secure.s3.us-west-2.amazonaws.com",
      "https://s3.us-west-2.amazonaws.com",
      "https://*.notion.so",
    ],
    "frame-src": [
      "'self'",
      "https://www.youtube.com",
      "https://www.youtube-nocookie.com",
      "https://player.vimeo.com",
      "https://drive.google.com",
    ],
    "connect-src": [
      "'self'",
      "https://api.notion.com",
      "https://api.resend.com",
      "https://api.openai.com",
      "https://graph.facebook.com",
      "https://*.vercel.app",
      "wss://*.vercel.app",
    ],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  }
  return Object.entries(directives)
    .map(([key, vals]) => `${key} ${vals.join(" ")}`)
    .join("; ")
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  const token =
    request.cookies.get("better-auth.session_token")?.value ??
    request.cookies.get("__Secure-better-auth.session_token")?.value

  if (!isPublic && !token) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (token && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  // Nonce CSP por request — passamos via header pra Next.js Server
  // Components lerem em layout.tsx e aplicarem em <script nonce>.
  // Edge runtime tem crypto global; randomUUID dá 122 bits de entropia
  // — suficiente pra hash usado em nonce.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const reqHeaders = new Headers(request.headers)
  reqHeaders.set("x-nonce", nonce)

  const response = NextResponse.next({ request: { headers: reqHeaders } })
  response.headers.set("Content-Security-Policy", buildCSP(nonce))
  return response
}

export const config = {
  matcher: [
    // Exclui assets estáticos do middleware. Importante: API routes
    // estáticas (built-in Next.js) NÃO devem receber CSP via header
    // — só docs HTML. Mas como o middleware roda em tudo, o header
    // só efetivamente aplica via browser em respostas content-type
    // text/html (browsers ignoram CSP em JSON).
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)).*)",
  ],
}
