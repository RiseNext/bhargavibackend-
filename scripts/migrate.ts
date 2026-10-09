/**
 * Migration runner — forward-only, sequential, explicit.
 *
 * Run with `npm run migrate` (or `--status` to list without applying). It is
 * deliberately NOT wired into container start-up: Railway can briefly run two
 * containers during a deploy, and two processes applying DDL concurrently is
 * risk 15. An advisory lock guards against it anyway.
 *
 * Connects to the DIRECT Neon endpoint (D-017). The pooled endpoint is
 * transaction-mode and cannot reliably run DDL.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import type { Client } from "pg";
import { withDirectClient, withMigrationLock } from "../src/lib/db-direct";
import { assertTargetAllowed, formatTarget } from "../src/lib/db-target-guard";

const ROOT = resolve(import.meta.dirname, "..");
const MIGRATIONS_DIR = resolve(ROOT, "migrations");

interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
}

function loadEnvFile(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(ROOT, file);
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
}

function discover(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  return files.map((filename) => {
    const match = /^(\d+)_(.+)\.sql$/.exec(filename);
    if (!match || !match[1] || !match[2]) {
      throw new Error(
        `Migration "${filename}" does not match the required NNN_name.sql pattern`,
      );
    }
    const sql = readFileSync(resolve(MIGRATIONS_DIR, filename), "utf8");
    return {
      version: match[1],
      name: match[2],
      filename,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    };
  });
}

async function ensureLedger(client: Client): Promise<void> {
  // Infrastructure, not a migration — which is why it is created here and does
  // not appear in the numbered sequence.
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version     text PRIMARY KEY,
      name        text NOT NULL,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now(),
      duration_ms int NOT NULL
    )
  `);
}

interface AppliedRow {
  version: string;
  name: string;
  checksum: string;
  applied_at: Date;
}

async function applied(client: Client): Promise<Map<string, AppliedRow>> {
  const { rows } = await client.query<AppliedRow>(
    "SELECT version, name, checksum, applied_at FROM _migrations ORDER BY version",
  );
  return new Map(rows.map((r) => [r.version, r]));
}

/**
 * An already-applied migration whose file has changed is a hard error.
 *
 * Forward-only means the applied SQL is history: editing it makes the ledger
 * lie about what the database actually contains, and the next environment gets
 * a different schema from the same repo.
 */
function assertUnchanged(file: MigrationFile, row: AppliedRow): void {
  if (row.checksum !== file.checksum) {
    throw new Error(
      `Migration ${file.filename} has been modified after being applied ` +
        `(applied ${row.applied_at.toISOString()}).\n` +
        "Migrations are forward-only: revert the edit and add a NEW migration instead.",
    );
  }
}

async function run(options: { statusOnly: boolean }): Promise<void> {
  loadEnvFile();

  // 🔴 FAIL-CLOSED, AND BEFORE ANY CONNECTION — the same guard, and the same
  // reasoning, as `admin:create`. `loadEnvFile()` above prefers `.env.local`,
  // which is exactly where a real Neon connection string lives; without this a
  // bare `npm run migrate` applies DDL to production. Migrating production is a
  // legitimate act (B14), so a remote host is allowed — but only when the
  // operator names it. `--status` is guarded too: the hazard is not knowing
  // which database you are looking at.
  const target = assertTargetAllowed(
    process.env.DATABASE_URL_UNPOOLED,
    process.argv,
    options.statusOnly ? "migrate --status" : "migrate",
  );
  process.stdout.write(`migrate target: ${formatTarget(target)}\n`);

  const files = discover();
  if (files.length === 0) throw new Error("No migrations found");

  await withDirectClient(async (client) => {
    await ensureLedger(client);

    await withMigrationLock(client, async () => {
      const done = await applied(client);

      for (const file of files) {
        const row = done.get(file.version);
        if (row) assertUnchanged(file, row);
      }

      const pending = files.filter((f) => !done.has(f.version));

      if (options.statusOnly) {
        process.stdout.write(`\nMigrations (${files.length} total)\n`);
        for (const f of files) {
          const row = done.get(f.version);
          const state = row ? `applied ${row.applied_at.toISOString()}` : "PENDING";
          process.stdout.write(`  ${f.version}  ${f.name.padEnd(28)} ${state}\n`);
        }
        process.stdout.write(`\n${pending.length} pending\n`);
        return;
      }

      if (pending.length === 0) {
        process.stdout.write("Schema is up to date — nothing to apply.\n");
        return;
      }

      for (const file of pending) {
        const started = Date.now();
        process.stdout.write(`Applying ${file.filename} … `);

        // Each migration is its own transaction: a failure leaves the ledger and
        // the schema consistent with each other, and the next run retries only
        // the migration that failed.
        await client.query("BEGIN");
        try {
          await client.query(file.sql);
          const duration = Date.now() - started;
          await client.query(
            `INSERT INTO _migrations (version, name, checksum, duration_ms)
             VALUES ($1, $2, $3, $4)`,
            [file.version, file.name, file.checksum, duration],
          );
          await client.query("COMMIT");
          process.stdout.write(`ok (${String(duration)}ms)\n`);
        } catch (err) {
          await client.query("ROLLBACK");
          process.stdout.write("FAILED\n");
          throw new Error(
            `Migration ${file.filename} failed: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err },
          );
        }
      }

      process.stdout.write(`\n${pending.length} migration(s) applied.\n`);
    });
  });
}

const statusOnly = process.argv.includes("--status");

run({ statusOnly }).catch((err: unknown) => {
  process.stderr.write(
    `\n${basename(import.meta.filename)}: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
