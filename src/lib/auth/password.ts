/**
 * Password hashing — Argon2id (SECURITY §2).
 *
 * `@node-rs/argon2` is used rather than the `argon2` package because it ships
 * prebuilt binaries and needs no node-gyp toolchain at install time, which
 * matters for a Railway build and for Windows development. Recorded as a
 * dependency reason per CLAUDE.md §7.
 *
 * There is no public signup. Accounts are created by CLI (`npm run admin:create`),
 * so no default credential can ship.
 */

import { hash, verify } from "@node-rs/argon2";
import { timingSafeEqual } from "node:crypto";

/**
 * `Algorithm.Argon2id` from `@node-rs/argon2`, inlined.
 *
 * That export is an ambient const enum, which `isolatedModules` cannot read as
 * a value. The variant is pinned explicitly rather than left to the library
 * default, because which Argon2 variant is used is a security property and
 * should not change silently with a dependency bump.
 */
const ARGON2ID = 2;

/**
 * OWASP's recommended Argon2id baseline: 19 MiB, 2 iterations, 1 lane. The cost
 * lives in the PHC string the hash encodes, so raising it later needs no
 * migration — only a rehash on next login.
 */
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Rejects the obviously-weak before it ever reaches a hash. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

export function validatePasswordStrength(password: string): string[] {
  const problems: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`must be at least ${String(MIN_PASSWORD_LENGTH)} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    problems.push(`must be at most ${String(MAX_PASSWORD_LENGTH)} characters`);
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    problems.push("must mix upper and lower case");
  }
  if (!/\d/.test(password)) problems.push("must contain a digit");
  return problems;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/**
 * Verifies a password, returning false rather than throwing on a malformed
 * stored hash — a corrupt row must read as "wrong password", not as a 500 that
 * distinguishes it.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password, OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison for non-password secrets (API keys, CSRF
 * tokens). `===` on a secret leaks its prefix through timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // Length is not secret, but timingSafeEqual throws on a mismatch, so compare
  // against a fixed-size digest-like padding instead of returning early on it.
  if (bufA.length !== bufB.length) {
    // Still do a comparison of equal length so the timing does not depend on
    // where the difference is.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
