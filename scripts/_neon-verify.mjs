/**
 * Read-only Neon query helper for verification work.
 *
 * This sandbox's resolver intermittently answers ENOTFOUND / EREFUSED for the
 * Neon endpoint hostnames even though they resolve and connect fine seconds
 * later — `resolve4` returns EREFUSED while `dns.lookup` succeeds. Retrying the
 * CONNECT is the difference between a verification pass and a false negative,
 * so every query here is wrapped.
 *
 * Nothing in this file writes. It exists to inspect the real database without
 * risking it.
 */

import pg from "pg";

const TRANSIENT = new Set(["ENOTFOUND", "EAI_AGAIN", "EREFUSED", "ETIMEDOUT", "ECONNRESET"]);

export async function withNeon(fn, { direct = true, attempts = 6 } = {}) {
  process.loadEnvFile("c:/progromming/anjanabhargavi/backend/.env.local");
  const key = direct ? "DATABASE_URL_UNPOOLED" : "DATABASE_URL";

  let lastError;
  for (let i = 0; i < attempts; i++) {
    const client = new pg.Client({
      connectionString: process.env[key],
      connectionTimeoutMillis: 20000,
    });
    try {
      await client.connect();
      try {
        return await fn(async (sql, params) => (await client.query(sql, params)).rows);
      } finally {
        await client.end().catch(() => undefined);
      }
    } catch (err) {
      lastError = err;
      if (!TRANSIENT.has(err.code)) throw err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastError;
}

export function table(rows) {
  for (const r of rows) {
    console.log("  " + Object.entries(r).map(([k, v]) => `${k}=${String(v)}`).join("  "));
  }
}
