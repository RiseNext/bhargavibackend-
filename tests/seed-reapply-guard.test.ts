/**
 * 🔴 Re-applying a seed stage must not silently revert the owner's content.
 *
 * THE DEFECT THIS LOCKS DOWN. The stages upsert on their key, so they OVERWRITE
 * rather than merge. A bare `npm run seed` was safe only because the
 * `_seed_stages` ledger skipped everything — which hid the fact that a forced
 * `npm run seed -- --stage s1` reverts every edited title, quote, question, job
 * and opening hour across 12 tables. It was verified by editing a
 * `services.title`, forcing the stage, and watching the seeded string come back
 * with NO row-count change to show anything had happened.
 *
 * `docs/PRODUCTION-RECONCILIATION.md` already states that re-seeding must not
 * happen and the runbook only ever seeds PENDING stages, so the refusal breaks
 * no documented procedure.
 *
 * The guard is asserted through the real CLI, because the hazard is the CLI.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { describeDb, withClient } from "./helpers/db";

const ROOT = resolve(import.meta.dirname, "..");

function runSeed(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync("npx", ["tsx", "scripts/seed.ts", ...args], {
      cwd: ROOT,
      encoding: "utf8",
      shell: true,
      env: { ...process.env },
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

describeDb("🔴 seed refuses to re-apply an already-applied stage", () => {
  // The ledger is `_`-prefixed, so `truncateAll` leaves it alone. This test
  // therefore owns its row explicitly and removes it again.
  let preExisting = false;

  beforeAll(async () => {
    await withClient(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS _seed_stages (
          stage      text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now(),
          counts     jsonb NOT NULL
        )
      `);
      const { rows } = await client.query("SELECT stage FROM _seed_stages WHERE stage = 's1'");
      preExisting = rows.length > 0;
      if (!preExisting) {
        await client.query(
          "INSERT INTO _seed_stages (stage, counts) VALUES ('s1', '{}'::jsonb)",
        );
      }
    });
  });

  afterAll(async () => {
    if (preExisting) return;
    await withClient(async (client) => {
      await client.query("DELETE FROM _seed_stages WHERE stage = 's1'");
    });
  });

  it("refuses `--stage s1`, names the stage, and exits non-zero", () => {
    const { code, out } = runSeed(["--stage", "s1"]);

    expect(code, "a refused re-apply must exit non-zero").not.toBe(0);
    expect(out).toContain("has already been applied");
    // The operator must be told WHY, not just that it stopped.
    expect(out).toMatch(/revert|upsert/i);
    expect(out).toContain("Nothing has");
    // …and must be given the deliberate escape hatch.
    expect(out).toContain("--force");
    // 🔴 It must not have run the stage: no stage banner, no counts.
    expect(out).not.toContain("Stage S1 ok.");
  });

  it("still reports status without refusing, so the ledger stays inspectable", () => {
    const { code, out } = runSeed(["--status"]);
    expect(code).toBe(0);
    expect(out).toContain("Seed stages");
    expect(out).not.toContain("has already been applied");
  });

  it("names only the stage that was asked for, so it is not a blanket refusal", () => {
    // A guard that refused every invocation would pass the test above while
    // breaking the runbook's `--stage s2` / `--stage s3` steps. The ledger's
    // contents vary between machines, so this asserts the property that does
    // not: the refusal is about the ONE stage named on the command line.
    const { out } = runSeed(["--stage", "s1"]);
    expect(out).toContain("Stage S1 has already been applied");
    expect(out).not.toContain("Stage S2 has already been applied");
    expect(out).not.toContain("Stage S3 has already been applied");
    // The escape hatch it offers must be for that same stage.
    expect(out).toContain("--stage s1 --force");
  });
});
