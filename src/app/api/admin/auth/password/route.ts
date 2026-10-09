/**
 * POST /api/admin/auth/password — admin operation 4 of 4.
 *
 * Requires the current password even though the session already proves identity:
 * a borrowed session should not be able to lock the real owner out.
 *
 * On success every OTHER session for this user is revoked, which is the point of
 * server-side sessions (P-011) — a password change must actually evict whoever
 * else was holding one.
 */

import { cookies } from "next/headers";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireAdminMutation } from "@/lib/auth/guard";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  findLoginCandidate,
  revokeAllSessionsForUser,
} from "@/lib/auth/session";
import { query } from "@/lib/db";
import { invalidJson, unauthorized, unprocessable } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, readJsonBody, respond } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

export function POST(request: Request): Promise<Response> {
  return handle(
    "POST /api/admin/auth/password",
    async () => {
      const { user } = await requireAdminMutation(request);

      const body = await readJsonBody(request);
      if (body.kind !== "ok") throw invalidJson();

      const parsed = schema.safeParse(body.value);
      if (!parsed.success) {
        throw unprocessable("Current and new password are both required.");
      }

      const candidate = await findLoginCandidate(user.email);
      if (!candidate) throw unauthorized();

      if (!(await verifyPassword(candidate.password_hash, parsed.data.currentPassword))) {
        await audit({
          actorId: user.id,
          action: "login_failed",
          entityType: "admin_users",
          entityId: user.id,
          diff: { reason: "password_change_wrong_current" },
          ip: clientIp(request),
        });
        throw unauthorized("Current password is incorrect.");
      }

      const problems = validatePasswordStrength(parsed.data.newPassword);
      if (problems.length > 0) {
        throw unprocessable(`New password ${problems.join(", ")}.`);
      }

      if (parsed.data.newPassword === parsed.data.currentPassword) {
        throw unprocessable("New password must differ from the current one.");
      }

      const hash = await hashPassword(parsed.data.newPassword);
      await query(
        `UPDATE admin_users
            SET password_hash = $2, password_changed_at = now(),
                failed_login_count = 0, locked_until = NULL
          WHERE id = $1`,
        [user.id, hash],
      );

      const store = await cookies();
      const currentToken = store.get(SESSION_COOKIE)?.value;
      const revoked = await revokeAllSessionsForUser(user.id, currentToken);

      await audit({
        actorId: user.id,
        action: "password_change",
        entityType: "admin_users",
        entityId: user.id,
        // The count is useful; neither password is, and `redactDiff` would
        // strip them anyway.
        diff: { otherSessionsRevoked: revoked },
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined,
      });

      return respond(
        { ok: true, otherSessionsRevoked: revoked },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );
}
