/**
 * The FIRST of the two auth gates.
 *
 * Middleware runs on the Edge runtime, where `pg` is unavailable — so it cannot
 * validate a session against the database. It therefore does the cheap,
 * structural part: no session cookie ⇒ never reach an admin route. The
 * authoritative check is `requireAdmin()` inside every handler (the second
 * gate), which is what makes a middleware-matcher typo survivable.
 *
 * Both gates exist precisely because either one alone has a known failure mode:
 * middleware can be mis-matched, and a handler can be written without its check.
 */

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "bhw_admin_session";

/** Reachable without a session: the login screen and the login endpoint. */
const PUBLIC_ADMIN_PATHS = new Set([
  "/admin/login",
  "/api/admin/auth/login",
  "/api/admin/auth/logout",
]);

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.has(pathname)) return NextResponse.next();

  const hasCookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (hasCookie) return NextResponse.next();

  // An API caller gets the error envelope every other endpoint uses; a browser
  // gets sent to the login page with somewhere to return to.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required." },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store, private",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }

  const login = new URL("/admin/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Both subtrees, deliberately listed separately rather than as one clever
  // pattern — this is the line a typo would silently break.
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
