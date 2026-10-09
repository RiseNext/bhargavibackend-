/**
 * POST /api/admin/auth/login — admin operation 1 of 4.
 *
 * Security properties this handler must keep (SECURITY §2):
 *  · GENERIC errors — the response never distinguishes "no such account" from
 *    "wrong password" from "locked", because that distinction is an account
 *    enumeration oracle.
 *  · A dummy hash verification runs when the account does not exist, so the
 *    response time does not reveal whether it does.
 *  · Lockout on the email AND the IP.
 *  · Both outcomes are audited.
 */

import { cookies } from "next/headers";
import { z } from "zod";
import { audit } from "@/lib/audit";
import {
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  createSession,
  csrfCookieOptions,
  findLoginCandidate,
  isLockedOut,
  newCsrfToken,
  recordFailedLogin,
  recordSuccessfulLogin,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { unauthorized, rateLimited } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, readJsonBody, respond } from "@/lib/http";
import { consume } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(200),
});

/**
 * A real Argon2id hash of a random value, computed once per process.
 *
 * Verifying against this when the email is unknown keeps the failure path the
 * same cost as the success path. Without it, a fast 401 means "no such user".
 */
let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(`absent-account-${Math.random().toString(36)}`);
  return dummyHashPromise;
}

export function POST(request: Request): Promise<Response> {
  return handle(
    "POST /api/admin/auth/login",
    async () => {
      const ip = clientIp(request);
      const userAgent = request.headers.get("user-agent") ?? undefined;

      // Brute-force protection keyed on the IP. Unlike the public submission
      // endpoint, this limiter FAILS CLOSED — refusing a login attempt is safe,
      // whereas refusing a lead is not.
      const limit = await consume(`login:ip:${ip ?? "unknown"}`, {
        limit: 10,
        windowMs: 15 * 60 * 1000,
        failOpen: false,
      });
      if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);

      const body = await readJsonBody(request);
      if (body.kind !== "ok") throw unauthorized("Invalid email or password.");

      const parsed = schema.safeParse(body.value);
      if (!parsed.success) throw unauthorized("Invalid email or password.");

      const { email, password } = parsed.data;
      const candidate = await findLoginCandidate(email);

      if (!candidate) {
        await verifyPassword(await dummyHash(), password);
        await audit({
          action: "login_failed",
          entityType: "admin_users",
          diff: { reason: "unknown_account" },
          ip,
          userAgent,
        });
        throw unauthorized("Invalid email or password.");
      }

      // Locked and deactivated accounts produce the SAME message as a wrong
      // password — otherwise the response confirms the account exists.
      if (!candidate.is_active || isLockedOut(candidate)) {
        await audit({
          actorId: candidate.id,
          action: "login_failed",
          entityType: "admin_users",
          entityId: candidate.id,
          diff: { reason: candidate.is_active ? "locked" : "inactive" },
          ip,
          userAgent,
        });
        throw unauthorized("Invalid email or password.");
      }

      if (!(await verifyPassword(candidate.password_hash, password))) {
        await recordFailedLogin(candidate.id);
        await audit({
          actorId: candidate.id,
          action: "login_failed",
          entityType: "admin_users",
          entityId: candidate.id,
          diff: { reason: "bad_password" },
          ip,
          userAgent,
        });
        throw unauthorized("Invalid email or password.");
      }

      await recordSuccessfulLogin(candidate.id);
      const { token } = await createSession({ userId: candidate.id, ip, userAgent });
      const csrf = newCsrfToken();

      const store = await cookies();
      store.set(SESSION_COOKIE, token, sessionCookieOptions());
      store.set(CSRF_COOKIE, csrf, csrfCookieOptions());

      await audit({
        actorId: candidate.id,
        action: "login",
        entityType: "admin_users",
        entityId: candidate.id,
        ip,
        userAgent,
      });

      return respond(
        {
          ok: true,
          user: {
            id: candidate.id,
            email: candidate.email,
            name: candidate.name,
            role: candidate.role,
          },
        },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );
}
