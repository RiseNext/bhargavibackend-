/**
 * Direct (unpooled) database access — DDL only (D-017).
 *
 * Neon's pooled endpoint is transaction-mode: it cannot reliably run migrations,
 * which need advisory locks and session state to survive across statements.
 * Migrations and the seed therefore connect to the direct endpoint, and nothing
 * else does.
 *
 * This module is used by scripts, never by a request handler.
 */

import { Client } from "pg";

export interface DirectClientOptions {
  /** Defaults to DATABASE_URL_UNPOOLED. */
  connectionString?: string;
  /** DDL on a large table can legitimately exceed the runtime timeout. */
  statementTimeoutMs?: number;
}

export async function withDirectClient<T>(
  fn: (client: Client) => Promise<T>,
  options: DirectClientOptions = {},
): Promise<T> {
  const connectionString =
    options.connectionString ?? process.env.DATABASE_URL_UNPOOLED;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_UNPOOLED is not set. Migrations must run against Neon's DIRECT endpoint, " +
        "not the pooled one (docs/DECISIONS.md D-017).",
    );
  }

  const client = new Client({
    connectionString,
    application_name: "bhw-migrate",
    statement_timeout: options.statementTimeoutMs ?? 120_000,
  });

  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Serialises migration runs across replicas (risk 15).
 *
 * Railway can briefly run two containers during a deploy. If a human fires the
 * migration step twice, or a future release wires it into start-up, two
 * processes could apply the same migration concurrently and corrupt the schema.
 * A session-level advisory lock makes the second one wait instead.
 */
export const MIGRATION_LOCK_KEY = 827_341_905;

export async function withMigrationLock<T>(
  client: Client,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
  try {
    return await fn();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
  }
}
