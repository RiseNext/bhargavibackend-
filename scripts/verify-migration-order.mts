/**
 * Migration 014's ordering dependency — tested, not asserted.
 *
 * `014_reconcile_code_owned_content.sql` carries a comment claiming it "fails
 * loudly rather than corrupting anything" if run before 013. That is a claim
 * about behaviour, and a comment is not evidence. This script reproduces the
 * observed production schema (migrations 001…011, the OLD `*_is_a_pair`
 * constraints), tries 014 out of order, and checks three things:
 *
 *   1. it FAILS — the old constraint rejects a NULL label beside a live href
 *   2. it leaves NOTHING behind — `migrate.ts` wraps each migration in
 *      BEGIN/COMMIT, so the whole file rolls back as one unit
 *   3. the correct order 012 → 013 → 014 then succeeds on the same database
 *
 * Run: npm run verify:migration-order
 *
 * 🔴 Loopback only. It creates and drops databases.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

import { assertTargetAllowed } from "../src/lib/db-target-guard";

const ROOT = resolve(import.meta.dirname, "..");
const MIG = resolve(ROOT, "migrations");

const baseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const target = assertTargetAllowed(baseUrl, process.argv, "verify:migration-order");
if (!target.local) {
  process.stderr.write("verify:migration-order creates and drops databases. Loopback only.\n");
  process.exit(1);
}

const DB = "bhw_migorder";
let pass = 0;
let fail = 0;
const check = (l: string, ok: boolean, d = "") => {
  if (ok) { pass++; console.log(`  OK  ${l}`); }
  else { fail++; console.log(`  XX  ${l}${d === "" ? "" : ` :: ${d}`}`); }
};

const file = (prefix: string): string => {
  const name = readdirSync(MIG).find((f) => f.startsWith(prefix));
  if (name === undefined) throw new Error(`no migration starting ${prefix}`);
  return readFileSync(resolve(MIG, name), "utf8");
};

const urlFor = (db: string): string => {
  const u = new URL(baseUrl ?? "");
  u.pathname = `/${db}`;
  return u.toString();
};

async function withClient<T>(db: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: urlFor(db) });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end().catch(() => undefined);
  }
}

/** Runs one migration the way `migrate.ts` does — inside a transaction. */
async function applyInTransaction(c: Client, sql: string): Promise<string | null> {
  await c.query("BEGIN");
  try {
    await c.query(sql);
    await c.query("COMMIT");
    return null;
  } catch (e) {
    await c.query("ROLLBACK");
    return e instanceof Error ? e.message : String(e);
  }
}

async function main(): Promise<void> {
  console.log(`MIGRATION ORDER — ${target.host}\n`);

  const admin = new Client({ connectionString: urlFor("postgres") });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();

  await withClient(DB, async (c) => {
    console.log("== 1. reproduce the observed production schema (001 … 011) ==");
    for (const name of readdirSync(MIG).sort()) {
      const n = Number(name.slice(0, 3));
      if (Number.isNaN(n) || n > 11) continue;
      await c.query(readFileSync(resolve(MIG, name), "utf8"));
    }
    const { rows: cons } = await c.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
        WHERE conrelid = 'content_blocks'::regclass AND conname LIKE '%cta%is_a_pair%'`,
    );
    check("the OLD *_is_a_pair constraints are in place", cons.length === 2,
      `found ${String(cons.length)}`);

    // The two half-stored CTAs as production actually holds them.
    await c.query(
      `INSERT INTO content_blocks (page, slot, cta_label, cta_href)
       VALUES ('about','story','Consult with Anjana','/contact'),
              ('home','testimonials','All 23 reviews','/testimonials')`,
    );
    check("the pre-migration CTA rows are loaded", true);

    console.log("\n== 2. 🔴 014 OUT OF ORDER must fail, and change nothing ==");
    const before = JSON.stringify(
      (await c.query("SELECT page, slot, cta_label, cta_href FROM content_blocks ORDER BY page")).rows,
    );

    const err = await applyInTransaction(c, file("014"));
    check("014 before 013 is REJECTED", err !== null, "it succeeded, which it must not");
    if (err !== null) {
      check("…by the dead-pair constraint, naming it", /cta_is_a_pair/.test(err), err.slice(0, 120));
    }

    const after = JSON.stringify(
      (await c.query("SELECT page, slot, cta_label, cta_href FROM content_blocks ORDER BY page")).rows,
    );
    check("🔴 and the rollback left the data byte-identical", before === after);

    // The failure must also not have half-applied the EARLIER statements in the
    // same file — the NULLing of code-owned text columns comes before the CTA
    // statement that fails.
    const { rows: still } = await c.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM content_blocks WHERE cta_label IS NOT NULL`,
    );
    check("no partial application: both labels still present", still[0]?.n === "2", still[0]?.n);

    console.log("\n== 3. the correct order 012 → 013 → 014 succeeds ==");
    for (const prefix of ["012", "013"]) {
      const e = await applyInTransaction(c, file(prefix));
      check(`${prefix} applies`, e === null, e ?? "");
    }
    const e14 = await applyInTransaction(c, file("014"));
    check("014 applies once 013 has replaced the constraint", e14 === null, e14 ?? "");

    const { rows: fixed } = await c.query<{ cta_label: string | null; cta_href: string | null }>(
      `SELECT cta_label, cta_href FROM content_blocks WHERE page='about' AND slot='story'`,
    );
    check("the derived label is cleared", fixed[0]?.cta_label === null);
    check("🔴 the editable destination is KEPT", fixed[0]?.cta_href === "/contact");

    console.log("\n== 4. idempotent at the end of the real sequence ==");
    const snap = async (): Promise<string> =>
      JSON.stringify(
        (await c.query(
          "SELECT page, slot, cta_label, cta_href, extra FROM content_blocks ORDER BY page, slot",
        )).rows,
      );
    const once = await snap();
    check("second pass is a no-op", (await applyInTransaction(c, file("014"))) === null);
    check("…and the data is unchanged", (await snap()) === once);
  });

  const cleanup = new Client({ connectionString: urlFor("postgres") });
  await cleanup.connect();
  await cleanup.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await cleanup.end();
  console.log(`\n-- disposable database ${DB} dropped`);

  console.log(`\n${String(pass)} passed, ${String(fail)} failed`);
}

main()
  .catch((e: unknown) => {
    console.error("HARNESS ERROR:", e instanceof Error ? e.message : String(e));
    fail++;
  })
  .finally(() => {
    process.exit(fail > 0 ? 1 : 0);
  });
