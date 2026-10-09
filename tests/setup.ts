/**
 * Test bootstrap.
 *
 * Loads `.env.test` if present, otherwise `.env.local`, so the suite runs
 * against a disposable local database rather than anything shared. Tests that
 * need a database skip themselves when none is reachable, so `npm test` stays
 * useful on a machine with no Postgres.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

for (const file of [".env.test", ".env.local"]) {
  const path = resolve(ROOT, file);
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

/**
 * 🔴 Refuse to run against anything that is not a local database.
 *
 * `tests/helpers/db.ts` runs `TRUNCATE … CASCADE` over every table it
 * discovers from `pg_tables` — it has no fixed allowlist, so it empties
 * whatever it is pointed at. `audit_log` blocks `DELETE` but NOT `TRUNCATE`,
 * so even the append-only trail would go.
 *
 * Two things make that dangerous rather than theoretical: this file falls back
 * to `.env.local` when `.env.test` is absent, and `.env.local` is exactly where
 * someone would paste a real connection string while setting the project up.
 * `npm test` would then empty production, and the first symptom would be a
 * clinic with no leads.
 *
 * Deliberately no opt-out. Running the suite against a remote database is never
 * what you want; if that day ever comes, changing this line should be a
 * conscious act with a code review attached.
 */
for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const) {
  const url = process.env[key];
  if (url !== undefined && url !== "" && !/@(?:localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error(
      `Refusing to run the test suite: ${key} does not point at localhost.\n` +
        "The suite TRUNCATEs every table in the target database.\n" +
        "Use a local Postgres for tests (see docs/PRODUCTION-RUNBOOK.md §1).",
    );
  }
}

// `NODE_ENV` is typed readonly by @types/node; assigning through the record
// signature is the supported way to set it for a test process.
Object.assign(process.env, { NODE_ENV: "test" });
// Keep test output readable; the redaction tests install their own sink.
process.env.LOG_LEVEL ??= "error";
