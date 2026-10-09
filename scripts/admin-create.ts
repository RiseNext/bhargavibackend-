/**
 * Creates an admin account from the CLI.
 *
 * 🔴 There is no public signup, and no admin account is ever committed in a
 * seed — which is why this is a script and not a migration. B14 requires real
 * accounts to be created this way before production, with any bootstrap account
 * revoked afterwards.
 *
 * Usage:
 *   npm run admin:create -- --email a@b.com --name "Anjana Bhargavi"
 *   npm run admin:create -- --email a@b.com --name "…" --password '…'
 *   npm run admin:create -- --list
 *   npm run admin:create -- --deactivate a@b.com
 *   npm run admin:create -- --reset-password a@b.com
 *
 * 🔴 `--reset-password` is the ONLY recovery path for a forgotten password, and
 * it is deliberately a CLI operation rather than a self-service flow. The site
 * sends no email at all (D-038 — `RESEND_API_KEY`, `MAIL_FROM` and
 * `ALERT_TO_EMAIL` are boot failures), so an emailed reset link is not merely
 * unimplemented, it is unavailable by decision. The alternatives were a reset
 * token table plus a mail provider — a large new attack surface for a
 * two-person admin — or nothing, which leaves a locked-out owner with no route
 * back in. This is the small, auditable middle: it needs an operator who
 * already holds the database credentials, which is the same trust level as
 * creating the account in the first place.
 *
 * 🔴 A REMOTE database must be named explicitly:
 *   npm run admin:create -- --email a@b.com --name "…" --confirm-remote ep-x.neon.tech
 *
 * Without that flag any non-loopback target is REFUSED before a connection is
 * opened. An account for `e2e-audit@example.test` once reached production Neon
 * because `.env.local` was picked up when the local test environment had not
 * been sourced; see src/lib/db-target-guard.ts.
 *
 * With no `--password`, a strong one is generated and printed ONCE. It is never
 * logged through the structured logger and never stored anywhere but the hash.
 */

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { withDirectClient } from "../src/lib/db-direct";
import { assertTargetAllowed, formatTarget } from "../src/lib/db-target-guard";
import { hashPassword, validatePasswordStrength } from "../src/lib/auth/password";

const ROOT = resolve(import.meta.dirname, "..");

function loadEnvFile(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(ROOT, file);
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = process.argv[i + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

/** Readable but high-entropy: ~95 bits, no ambiguous characters. */
function generatePassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_";
  const bytes = randomBytes(20);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  // Guarantee the strength rules are satisfied regardless of draw.
  return `Bh${out}7`;
}

async function main(): Promise<void> {
  loadEnvFile();

  // 🔴 FAIL-CLOSED, AND BEFORE ANY CONNECTION. `withDirectClient` connects to
  // DATABASE_URL_UNPOOLED, so that is the string that must be confirmed — not
  // DATABASE_URL, which may legitimately differ. Every mode is guarded,
  // including the read-only `--list`: the hazard is not knowing which database
  // is being used, and listing production admin emails is itself a disclosure.
  const target = assertTargetAllowed(
    process.env.DATABASE_URL_UNPOOLED,
    process.argv,
    "admin:create",
  );
  process.stdout.write(`admin:create target: ${formatTarget(target)}
`);

  const list = process.argv.includes("--list");
  const deactivate = arg("deactivate");
  const resetFor = arg("reset-password");

  await withDirectClient(async (client) => {
    if (list) {
      const { rows } = await client.query<{
        email: string;
        name: string;
        role: string;
        is_active: boolean;
        last_login_at: Date | null;
      }>(
        `SELECT email::text AS email, name, role, is_active, last_login_at
           FROM admin_users ORDER BY created_at`,
      );

      if (rows.length === 0) {
        process.stdout.write("No admin accounts exist.\n");
        return;
      }
      process.stdout.write("\nAdmin accounts\n");
      for (const r of rows) {
        const seen = r.last_login_at ? r.last_login_at.toISOString() : "never";
        process.stdout.write(
          `  ${r.is_active ? "active  " : "INACTIVE"} ${r.email.padEnd(32)} ${r.name.padEnd(24)} last login ${seen}\n`,
        );
      }
      return;
    }

    if (deactivate) {
      const res = await client.query(
        "UPDATE admin_users SET is_active = false WHERE email = $1",
        [deactivate],
      );
      if ((res.rowCount ?? 0) === 0) {
        throw new Error(`No admin account with email "${deactivate}"`);
      }
      // Deactivating must also evict any live session, or the account keeps
      // working until expiry.
      const sessions = await client.query(
        `UPDATE admin_sessions s SET revoked_at = now()
           FROM admin_users u
          WHERE s.user_id = u.id AND u.email = $1 AND s.revoked_at IS NULL`,
        [deactivate],
      );
      process.stdout.write(
        `Deactivated ${deactivate} and revoked ${String(sessions.rowCount ?? 0)} session(s).\n`,
      );
      return;
    }

    if (resetFor) {
      // A new one-time password, by the same generator the create path uses, so
      // there is one definition of "strong enough" here.
      const fresh = generatePassword();
      const problems = validatePasswordStrength(fresh);
      if (problems.length > 0) {
        throw new Error(`Generated password ${problems.join(", ")} — refusing to set it.`);
      }

      const hash = await hashPassword(fresh);

      // 🔴 Clearing the lockout counters is part of the reset, not a
      // convenience: the usual reason someone needs this is that they locked
      // themselves out, and leaving `locked_until` set would hand them a fresh
      // password they still cannot use for fifteen minutes.
      const res = await client.query(
        `UPDATE admin_users
            SET password_hash = $2, password_changed_at = now(),
                failed_login_count = 0, locked_until = NULL
          WHERE email = $1`,
        [resetFor, hash],
      );
      if ((res.rowCount ?? 0) === 0) {
        throw new Error(`No admin account with email "${resetFor}"`);
      }

      // 🔴 EVERY session goes, unlike the in-app change endpoint which spares
      // the caller's own. There is no caller here, and the premise of a reset is
      // that control of the account is in doubt — so any session still open is
      // exactly what must not survive.
      const sessions = await client.query(
        `UPDATE admin_sessions s SET revoked_at = now()
           FROM admin_users u
          WHERE s.user_id = u.id AND u.email = $1 AND s.revoked_at IS NULL`,
        [resetFor],
      );

      process.stdout.write(
        `\nReset the password for ${resetFor} and revoked ${String(sessions.rowCount ?? 0)} session(s).\n`,
      );
      // Written straight to stdout, never through the logger — same reasoning,
      // and the same handling instructions, as the create path below.
      process.stdout.write(`\n  Password (shown once): ${fresh}\n\n`);
      process.stdout.write("  Store it in a password manager now. It is not recoverable.\n");
      process.stdout.write("  Then change it at /admin/settings → Your password.\n");
      return;
    }

    const email = arg("email");
    const name = arg("name");
    if (!email || !name) {
      throw new Error(
        "Both --email and --name are required.\n" +
          '  npm run admin:create -- --email a@b.com --name "Anjana Bhargavi"',
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new Error(`"${email}" does not look like an email address`);
    }

    const supplied = arg("password");
    const password = supplied ?? generatePassword();

    const problems = validatePasswordStrength(password);
    if (problems.length > 0) {
      throw new Error(`Password ${problems.join(", ")}.`);
    }

    const hash = await hashPassword(password);

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO admin_users (email, password_hash, name, role, password_changed_at)
       VALUES ($1, $2, $3, 'admin', now())
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, hash, name],
    );

    if (rows.length === 0) {
      throw new Error(
        `An account for "${email}" already exists. To change its password, use ` +
          "/admin/settings → Your password, or --reset-password if it has been forgotten. " +
          "To retire the account, use --deactivate.",
      );
    }

    process.stdout.write(`\nCreated admin account ${email}\n`);
    if (!supplied) {
      // Written directly to stdout, not through the logger — the logger's
      // redaction would hide it, and this is the one moment it must be visible.
      process.stdout.write(`\n  Password (shown once): ${password}\n\n`);
      process.stdout.write("  Store it in a password manager now. It is not recoverable.\n");
    }
  });
}

main().catch((err: unknown) => {
  process.stderr.write(`\nadmin:create: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
