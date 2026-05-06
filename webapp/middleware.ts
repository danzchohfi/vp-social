import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// /invites and /api/invites are public so an unauthenticated invitee can
// (a) land on the accept page and see the inviter/scope context, and
// (b) the page can fetch /api/invites/[token] for that context. Without
// these, the middleware redirected the invite click to /login and dropped
// the redirect target — invitees signed up and ended up on /onboarding
// instead of accepting.
const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/api/auth", "/api/tiktok-proxy", "/privacy", "/terms", "/invites", "/api/invites"]

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

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)).*)"],
}
