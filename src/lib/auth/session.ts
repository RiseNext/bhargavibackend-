/**
 * Server-side sessions (P-011).
 *
 * Chosen over stateless JWTs because there are 1–2 users and INSTANT REVOCATION
 * matters more than statelessness when the protected data is patient enquiries.
 * A compromised session must die the moment it is noticed, not when it expires.
 *
 * 🔴 Only a hash of the token is stored. A database read must never yield a
 * usable session cookie.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { query, queryOne, transaction } from "../db";
import { env } from "../env";

export const SESSION_COOKIE = "bhw_admin_session";
export const CSRF_COOKIE = "bhw_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** Eight hours: long enough for a working day, short enough to limit exposure. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
/** Idle sessions are cut sooner than absolute expiry. */
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;

/**
 * HMAC rather than a bare hash: the keyed digest means a stolen database cannot
 * be brute-forced offline into valid tokens even for low-entropy input, and the
 * key lives only in SESSION_SECRET.
 */
export function hashToken(token: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(token).digest("hex");
}

export const newSessionToken = (): string => randomBytes(32).toString("base64url");
export const newCsrfToken = (): string => randomBytes(32).toString("base64url");

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "admin";
}

export interface ActiveSession {
  sessionId: string;
  user: SessionUser;
}

export interface CreateSessionInput {
  userId: string;
  ip: string | undefined;
  userAgent: string | undefined;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await query(
    `INSERT INTO admin_sessions (user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.userId, hashToken(token), expiresAt, input.ip ?? null, input.userAgent ?? null],
  );

  return { token, expiresAt };
}

interface SessionRow {
  session_id: string;
  user_id: string;
  email: string;
  name: string;
  role: "admin";
  last_seen_at: Date;
}

/**
 * Resolves a raw token to its session, or undefined.
 *
 * Every condition that makes a session unusable — expired, revoked, idle too
 * long, user deactivated — is checked in SQL so there is one place to get it
 * right. `last_seen_at` is refreshed on use, which is what makes idle timeout
 * meaningful.
 */
export async function resolveSession(token: string): Promise<ActiveSession | undefined> {
  if (token === "") return undefined;

  const row = await queryOne<SessionRow>(
    `SELECT s.id AS session_id, u.id AS user_id, u.email::text AS email, u.name, u.role,
            s.last_seen_at
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.last_seen_at > now() - ($2::bigint || ' milliseconds')::interval
        AND u.is_active`,
    [hashToken(token), SESSION_IDLE_MS],
  );

  if (!row) return undefined;

  // Touch only when it has drifted, so a page with many requests does not write
  // on every one of them.
  if (Date.now() - row.last_seen_at.getTime() > 60_000) {
    await query("UPDATE admin_sessions SET last_seen_at = now() WHERE id = $1", [
      row.session_id,
    ]);
  }

  return {
    sessionId: row.session_id,
    user: { id: row.user_id, email: row.email, name: row.name, role: row.role },
  };
}

export async function revokeSession(token: string): Promise<void> {
  await query(
    "UPDATE admin_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
    [hashToken(token)],
  );
}

/** Used after a password change: every other session for that user dies. */
export async function revokeAllSessionsForUser(
  userId: string,
  exceptToken?: string,
): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE admin_sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND ($2::text IS NULL OR token_hash <> $2)
      RETURNING id`,
    [userId, exceptToken === undefined ? null : hashToken(exceptToken)],
  );
  return rows.length;
}

/** Housekeeping, safe to run on a schedule. */
export async function deleteExpiredSessions(): Promise<number> {
  const rows = await query<{ id: string }>(
    "DELETE FROM admin_sessions WHERE expires_at < now() - interval '7 days' RETURNING id",
  );
  return rows.length;
}

// ---------------------------------------------------------------------------
// Lockout
// ---------------------------------------------------------------------------

/** Lockout applies to the email AND the IP (SECURITY §2). */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export interface LoginCandidate {
  id: string;
  email: string;
  name: string;
  role: "admin";
  password_hash: string;
  is_active: boolean;
  locked_until: Date | null;
  failed_login_count: number;
}

export function findLoginCandidate(email: string): Promise<LoginCandidate | undefined> {
  return queryOne<LoginCandidate>(
    `SELECT id, email::text AS email, name, role, password_hash, is_active,
            locked_until, failed_login_count
       FROM admin_users
      WHERE email = $1`,
    [email],
  );
}

export async function recordFailedLogin(userId: string): Promise<void> {
  await query(
    `UPDATE admin_users
        SET failed_login_count = failed_login_count + 1,
            locked_until = CASE
              WHEN failed_login_count + 1 >= $2
              THEN now() + ($3::bigint || ' milliseconds')::interval
              ELSE locked_until
            END
      WHERE id = $1`,
    [userId, MAX_FAILED_LOGINS, LOCKOUT_MS],
  );
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `UPDATE admin_users
          SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
        WHERE id = $1`,
      [userId],
    );
  });
}

export function isLockedOut(candidate: LoginCandidate): boolean {
  return candidate.locked_until !== null && candidate.locked_until.getTime() > Date.now();
}

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

/**
 * Double-submit CSRF: the token is in a readable cookie and must be echoed in a
 * header. An attacker's cross-site form can send the cookie but cannot read it
 * to set the header.
 *
 * Applied to admin mutations ONLY. 🔴 It must NEVER be applied to the public
 * submission endpoint — that endpoint carries no authority, and requiring a
 * token there would break the four live forms.
 */
export function csrfMatches(cookieToken: string | undefined, headerToken: string | null): boolean {
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(cookieToken, "utf8");
  const b = Buffer.from(headerToken, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict";
  path: string;
  maxAge: number;
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Secure in production; a plain-http localhost would otherwise reject it.
    secure: env().isProduction,
    // `strict` would drop the cookie on any cross-site navigation into /admin,
    // including from an emailed link. `lax` plus CSRF on mutations is the
    // standard pairing.
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export function csrfCookieOptions(): CookieOptions {
  return {
    // Readable by the admin UI's fetch wrapper, which is the point of a
    // double-submit token.
    httpOnly: false,
    secure: env().isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
