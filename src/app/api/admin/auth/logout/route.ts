/**
 * POST /api/admin/auth/logout — admin operation 2 of 4.
 *
 * Idempotent where it safely can be: logging out when already logged out is not
 * an error, and an error there would leave a user stuck with a cookie they
 * cannot clear.
 *
 * 🔴 BUT REVOKING A LIVE SESSION IS A MUTATION, AND IT IS CSRF-GUARDED.
 *
 * This route previously returned 200 unconditionally and checked no CSRF token.
 * A cross-site `POST` carried the admin's session cookie — which the browser
 * attaches automatically — and the handler revoked the session: measured at
 * 5 live sessions → 4, status 200, with `Origin: https://evil.example`
 * accepted. An attacker could force-log-out the administrator at will, which is
 * a denial of service on the admin panel and a ready-made setup for a
 * "your session expired, sign in again" phishing page. CLAUDE.md §10 requires
 * the double-submit token on admin mutations, and revoking a session plus
 * writing an audit row is a mutation.
 *
 * The three cases are now distinguished, so the fix does not cost the
 * idempotency the original comment was protecting:
 *
 *   no session cookie          → 200, clear cookies. Nothing to protect.
 *   cookie, but session dead   → 200, clear cookies. Already revoked or
 *                                expired; refusing would be the "stuck with a
 *                                cookie" case, and there is nothing to lose.
 *   cookie, session LIVE       → CSRF required. On failure 403 and the session
 *                                SURVIVES.
 */

import { cookies } from "next/headers";
import { audit } from "@/lib/audit";
import { currentSession } from "@/lib/auth/guard";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_COOKIE,
  csrfMatches,
  revokeSession,
} from "@/lib/auth/session";
import { CACHE_NO_STORE, clientIp, handle, ok } from "@/lib/http";
import { forbidden } from "@/lib/errors";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handle(
    "POST /api/admin/auth/logout",
    async () => {
      const store = await cookies();
      const token = store.get(SESSION_COOKIE)?.value;

      if (token) {
        // Resolve BEFORE deciding anything: a live session is what needs
        // protecting, and the audit row needs an actor.
        const session = await currentSession();

        if (session) {
          // 🔴 The CSRF gate sits here and nowhere earlier, so a stale cookie
          // can still be cleared without a token. Checked by hand rather than
          // through `requireAdminMutation()` because that throws 401 when no
          // session exists, which would break the two idempotent paths above.
          if (!csrfMatches(store.get(CSRF_COOKIE)?.value, request.headers.get(CSRF_HEADER))) {
            throw forbidden("CSRF token missing or invalid.");
          }

          await revokeSession(token);
          await audit({
            actorId: session.user.id,
            action: "logout",
            entityType: "admin_users",
            entityId: session.user.id,
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          });
        } else {
          // Dead or expired token. Revoking is a no-op but keeps the row tidy.
          await revokeSession(token);
        }
      }

      store.delete(SESSION_COOKIE);
      store.delete(CSRF_COOKIE);

      return ok({ admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );
}
