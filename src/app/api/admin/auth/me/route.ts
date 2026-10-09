/**
 * GET /api/admin/auth/me — admin operation 3 of 4.
 *
 * Never returns a password hash, a session token, or any field from
 * `admin_users` beyond identity (DB design §9: credentials are never returned
 * by any API).
 */

import { requireAdmin } from "@/lib/auth/guard";
import { CACHE_NO_STORE, handle, respond } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return handle(
    "GET /api/admin/auth/me",
    async () => {
      const { user } = await requireAdmin();
      return respond(
        { id: user.id, email: user.email, name: user.name, role: user.role },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );
}
