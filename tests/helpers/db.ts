/**
 * Integration-test database helper.
 *
 * Tests that need Postgres call `describeDb`, which skips the whole suite when
 * no database is reachable. That keeps `npm test` green and meaningful on a
 * machine with no local Postgres instead of producing a wall of connection
 * errors that hide real failures.
 */

import { Client } from "pg";
import { describe } from "vitest";

let reachable: boolean | undefined;

export async function isDbReachable(): Promise<boolean> {
  if (reachable !== undefined) return reachable;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    reachable = false;
    return reachable;
  }

  const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    reachable = true;
  } catch {
    reachable = false;
  } finally {
    await client.end().catch(() => undefined);
  }
  return reachable;
}

/** `describe` that skips when there is no database. */
export function describeDb(name: string, fn: () => void): void {
  const available = process.env.DATABASE_URL !== undefined;
  if (!available) {
    describe.skip(`${name} (skipped — DATABASE_URL not set)`, fn);
    return;
  }
  describe(name, fn);
}

export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Runs seed stage S1 into a freshly emptied database.
 *
 * Suites that need the seeded content must call this rather than relying on a
 * leftover `npm run seed`: another suite truncates tables, so depending on
 * ambient state makes a test's result depend on file order. Reusing the REAL
 * stage-S1 code also means this doubles as a check that the seed still runs.
 */
export async function seedStageS1(): Promise<void> {
  const { runStageS1 } = await import("../../scripts/seed/stage-s1");

  await withClient(async (client) => {
    await truncateAll(client);
    await client.query("BEGIN");
    try {
      await runStageS1(client);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

/**
 * Empties every data table, leaving the schema and the migration ledger.
 *
 * `_migrations` is excluded deliberately — truncating it would make the next
 * migrate run try to reapply everything.
 */
export async function truncateAll(client: Client): Promise<void> {
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename NOT LIKE '\\_%'`,
  );
  if (rows.length === 0) return;

  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  // audit_log blocks DELETE but not TRUNCATE, which is what makes this usable
  // as a test reset while the append-only guarantee still holds in production.
  await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
