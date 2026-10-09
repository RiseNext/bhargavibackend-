/**
 * Pooled database access — the connection every request handler uses (D-017).
 *
 * 🔴 Risk 26: Neon's pooled endpoint runs in *transaction* pooling mode, where a
 * server connection is handed to a different client between statements. Named
 * (server-side prepared) statements do not survive that and fail intermittently
 * in a way that looks random. node-postgres only prepares a statement when a
 * query carries a `name`, so the safe configuration is simply never to pass
 * one — and `assertNoPreparedStatement` turns a mistake into an immediate,
 * obvious error rather than a flaky production bug.
 *
 * Migrations do NOT use this pool. They use db-direct.ts.
 */

import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";
import { logger } from "./logger";

let pool: Pool | undefined;

function createPool(): Pool {
  const p = new Pool({
    connectionString: env().DATABASE_URL,
    // Railway runs one long-lived container, so in-process pooling is real.
    // Kept modest because Neon's pooler is the actual arbiter of capacity.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // A hung query must not hold a pooled connection forever.
    statement_timeout: 15_000,
    query_timeout: 15_000,
    application_name: "bhw-backend",
  });

  p.on("error", (err) => {
    // An idle client erroring out is normal with a remote pooler; it must not
    // take the process down.
    logger().error("db.pool.idle_client_error", { err });
  });

  return p;
}

export function db(): Pool {
  pool ??= createPool();
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = undefined;
    await p.end();
  }
}

/** Guards the one driver setting that breaks against a transaction-mode pooler. */
export function assertNoPreparedStatement(text: unknown): void {
  if (typeof text === "object" && text !== null && "name" in text) {
    throw new Error(
      "Named (prepared) statements are not supported on Neon's pooled endpoint — " +
        "remove the `name` property (see docs/DECISIONS.md D-017, risk 26).",
    );
  }
}

export type SqlParams = readonly unknown[];

/**
 * Parameterised query. CLAUDE.md §7: parameterised only, never string-built SQL.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: SqlParams = [],
): Promise<T[]> {
  assertNoPreparedStatement(text);
  const res = await db().query<T>(text, params as unknown[]);
  return res.rows;
}

/** Exactly-one-row query. Returns undefined when the result is empty. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: SqlParams = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/**
 * Runs `fn` inside a transaction on a single dedicated client.
 *
 * Needed wherever a write spans tables — a submission plus its audit row, a
 * content update plus its audit row — so a partial write can never be observed.
 */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      logger().error("db.rollback_failed", { err: rollbackErr });
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Health probe used by /api/health. Deliberately trivial and cheap. */
export async function pingDb(): Promise<boolean> {
  try {
    const rows = await query<{ ok: number }>("SELECT 1 AS ok");
    return rows[0]?.ok === 1;
  } catch (err) {
    logger().error("db.ping_failed", { err });
    return false;
  }
}
