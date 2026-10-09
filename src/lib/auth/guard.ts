/**
 * Per-handler authorisation — the SECOND of the two gates.
 *
 * 🔴 Risk 14: an admin route added without an auth check exposes patient data.
 * `middleware.ts` is the first gate, but middleware matchers are a single string
 * pattern and a typo silently un-guards a whole subtree. So every admin handler
 * also calls `requireAdmin()` itself, and a route-tree-enumerating test asserts
 * that every `/api/admin/**` path returns 401 unauthenticated — so a later
 * unguarded route fails CI rather than shipping.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE, csrfMatches, resolveSession } from "./session";
import type { ActiveSession } from "./session";
import { forbidden, unauthorized } from "../errors";

export async function currentSession(): Promise<ActiveSession | undefined> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return undefined;
  return resolveSession(token);
}

/**
 * Throws 401 unless a valid session exists.
 *
 * For API handlers. A SCREEN must use `requireAdminPage()` — see why below.
 */
export async function requireAdmin(): Promise<ActiveSession> {
  const session = await currentSession();
  if (!session) throw unauthorized();
  return session;
}

/**
 * 🔴 Page-level authorisation: REDIRECT, never throw.
 *
 * THE DEFECT THIS FIXES. `middleware.ts` runs on the Edge runtime and can only
 * check that a session cookie EXISTS — it cannot validate it against the
 * database. So an admin whose session has merely expired still holds the cookie,
 * sails through gate 1, and reaches the page, where `requireAdmin()` throws.
 *
 * In a route handler that throw becomes a clean `401 {"error":"…"}`. In a SERVER
 * COMPONENT there is nothing to turn it into a status, so React renders the
 * error boundary and the administrator gets:
 *
 *     HTTP 500 — "Application error: a server-side exception has occurred …
 *                 Digest: 659547821"
 *
 * Measured for all three stale-cookie cases: forged token, expired session and
 * revoked session. It is the ORDINARY path — the session TTL is 8 hours and the
 * idle timeout 2 hours — so every admin meets it, cannot tell what went wrong,
 * and cannot recover without clearing cookies by hand. It also puts an internal
 * error surface on screen, which CLAUDE.md §10 does not allow.
 *
 * The API route-tree test asserts 401 for every `/api/admin/**` path, which is
 * why this survived: no test rendered an admin PAGE with a stale cookie.
 *
 * Callers whose path is statically known pass it as `next`, so the admin lands
 * back where they were aiming — matching what the middleware already does for
 * the no-cookie case. Dynamic routes omit it rather than reconstruct an id.
 */
export async function requireAdminPage(next?: string): Promise<ActiveSession> {
  const session = await currentSession();
  if (session) return session;

  const target =
    next === undefined || next === ""
      ? "/admin/login"
      : `/admin/login?next=${encodeURIComponent(next)}`;

  // `redirect()` throws NEXT_REDIRECT, which Next turns into a 307 — so this
  // never returns, and callers can treat it as a narrowing guard.
  redirect(target);
}

/**
 * Authorisation plus CSRF, for every admin MUTATION.
 *
 * Also checks Origin where the browser sent one: a cross-site request that
 * somehow carried both cookie and token still fails.
 */
export async function requireAdminMutation(request: Request): Promise<ActiveSession> {
  const session = await requireAdmin();

  const store = await cookies();
  const cookieToken = store.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get(CSRF_HEADER);

  if (!csrfMatches(cookieToken, headerToken)) {
    throw forbidden("CSRF token missing or invalid.");
  }

  return session;
}
