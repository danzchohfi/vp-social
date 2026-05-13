import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// /invites + /api/invites are public so an unauthenticated invitee can
// land on the accept page (the API call inside it also goes through here).
// Same reason for /approve + /api/approve (per-post approval flow that
// the client opens from a WhatsApp link, no login), /c + /api/c
// (the permanent client-facing calendar page that lists pending +
// scheduled + published posts of one client, accessed via a tokenized
// public URL the agency shares once) and /a + /api/a (the approver
// magic-link portal — single token unifies posts + productions for an
// individual approver, no login).
const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/api/auth", "/api/tiktok-proxy", "/privacy", "/terms", "/invites", "/api/invites", "/approve", "/api/approve", "/c", "/api/c", "/a", "/api/a"]

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
