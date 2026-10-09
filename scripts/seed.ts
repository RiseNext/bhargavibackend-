/**
 * Staged seed runner — D-032.
 *
 * `gallery_images.media_id` is NOT NULL and is deliberately not weakened, and
 * Cloudinary media does not exist until Phase 6. The DDL order was never the
 * problem; the SEED order was. So the seed runs in three guarded, idempotent
 * stages:
 *
 *   S1  (E2)   everything with no media dependency
 *   S2  (E8)   media 26 → gallery_images 8 → 18 FK backfills → 4 D-027 rows
 *   S3  (E15)  content_blocks 54 (41 derived + 13 privacy) → content_block_items 17
 *
 * 🔴 S2 refuses to run before S1; S3 refuses to run before S2. Progress is
 * recorded in `_seed_stages`, so a bare re-run skips every applied stage.
 *
 * 🔴 That ledger skip is the ONLY reason a re-run is safe — the stages upsert on
 * their key, which OVERWRITES rather than merges. Re-running an applied stage
 * therefore reverts the owner's edits, so it now requires `--force`. See
 * `assertNotAlreadyApplied`.
 *
 * The seed is NOT a migration. It runs on the direct endpoint for consistency
 * with the migration step, and it never ships an admin account.
 *
 * Usage:
 *   npm run seed                         # every stage whose prerequisites are met
 *   npm run seed -- --stage s1           # one PENDING stage
 *   npm run seed -- --stage s1 --force   # re-apply, DISCARDING later edits
 *   npm run seed -- --status             # what has run
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { withDirectClient, withMigrationLock } from "../src/lib/db-direct";
import { assertTargetAllowed, formatTarget } from "../src/lib/db-target-guard";
import { runStageS1, type StageCounts } from "./seed/stage-s1";
import { runStageS2, isStageS2Possible } from "./seed/stage-s2";
import { runStageS3 } from "./seed/stage-s3";

const ROOT = resolve(import.meta.dirname, "..");

export type StageName = "s1" | "s2" | "s3";

const ORDER: StageName[] = ["s1", "s2", "s3"];

/**
 * The approved row counts (D-032, D-036). The runner asserts against these, so
 * a seed that silently inserts the wrong number of rows fails loudly instead of
 * being discovered later as six broken images.
 */
export const EXPECTED_COUNTS: Record<StageName, StageCounts> = {
  s1: {
    branches: 2,
    site_settings: 1,
    social_links: 3,
    stats: 4,
    services: 10,
    testimonials: 23,
    videos: 19,
    gallery_images: 0, // 🔴 deliberately zero — media_id is NOT NULL
    faqs: 6,
    jobs: 6,
    content_list_items: 19,
    // 🔵 10, not 9: the 9 routes present at 2fdf32a plus the new `privacy`
    // page (E17), whose row seeds canonical-only so the title and description
    // fall back to the site-wide template rather than being invented.
    page_meta: 10,
  },
  s2: {
    media: 26,
    gallery_images: 8,
    services_backfilled: 10,
    content_list_items_backfilled: 4,
    site_settings_backfilled: 4,
    // 🔵 FOUR, not three. D-027's prose says "three", but D-024's table says
    // ✅ Q-013 / D-041: hero 1 + intro 2. The founder portrait is derived
    // (`site.founder.photo` + an `altJsx` alt), so it is not a row.
    content_block_items_d027: 3,
  },
  s3: {
    // ✅ D-037 settled the exact 41-row list and the page/slot keys.
    //
    // 🔵 54, not 41: the 41 DERIVED rows migrated from the snapshot, plus the
    // 13 PRIVACY rows (E17 / D-021), which are new content rather than migrated
    // copy. `runStageS3` asserts the two sets separately — all 41 derived keys
    // present, and exactly 13 privacy rows still carrying their UNKNOWN markers
    // — so this total cannot drift without one of those failing first.
    content_blocks: 54,
    // 18 TOTAL: 14 from S3, plus S2's 4 D-027 image rows. S3 refuses to run
    // before S2, so by the time this is asserted all 18 exist.
    content_block_items: 17,
    content_block_items_s3: 14,
  },
};

function loadEnvFile(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(ROOT, file);
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
}

async function ensureLedger(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _seed_stages (
      stage      text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      counts     jsonb NOT NULL
    )
  `);
}

/**
 * Stages that have genuinely been applied.
 *
 * 🔴 A SYNTHETIC STAGE IS NOT DONE. `seed-local-full.mts` records S2 as applied
 * with `counts.synthetic = true` after inserting placeholder media that points
 * at Cloudinary's public `demo` cloud. Because the ledger simply said "s2", the
 * REAL S2 — the only step that ingests the verified upload manifest — was
 * skipped as already applied. The manifest sat on disk unused, content was
 * generated from the placeholder rows, and the result was 125 broken images on
 * the public site.
 *
 * So a synthetic stage is deliberately reported as NOT completed: real S2 is
 * allowed, and expected, to replace it. The row is kept rather than deleted so
 * the history of what happened survives.
 */
async function completed(client: Client): Promise<Set<StageName>> {
  const { rows } = await client.query<{ stage: string; counts: { synthetic?: boolean } | null }>(
    "SELECT stage, counts FROM _seed_stages",
  );
  return new Set(
    rows
      .filter((r) => r.counts?.synthetic !== true)
      .map((r) => r.stage as StageName),
  );
}

/** Stages recorded by the synthetic local seed, for an honest status report. */
async function syntheticStages(client: Client): Promise<Set<StageName>> {
  const { rows } = await client.query<{ stage: string; counts: { synthetic?: boolean } | null }>(
    "SELECT stage, counts FROM _seed_stages",
  );
  return new Set(
    rows.filter((r) => r.counts?.synthetic === true).map((r) => r.stage as StageName),
  );
}

async function record(client: Client, stage: StageName, counts: StageCounts): Promise<void> {
  await client.query(
    `INSERT INTO _seed_stages (stage, counts) VALUES ($1, $2)
     ON CONFLICT (stage) DO UPDATE SET applied_at = now(), counts = EXCLUDED.counts`,
    [stage, JSON.stringify(counts)],
  );
}

/** 🔴 The guard that makes the staging real rather than advisory. */
function assertPrerequisite(stage: StageName, done: Set<StageName>): void {
  const index = ORDER.indexOf(stage);
  const previous = ORDER[index - 1];
  if (previous && !done.has(previous)) {
    throw new Error(
      `Stage ${stage.toUpperCase()} refuses to run: ${previous.toUpperCase()} has not completed. ` +
        "The order exists because gallery_images.media_id is NOT NULL and content_block_items " +
        "reference S2's media (D-032).",
    );
  }
}

/**
 * Compares actual inserts against the approved counts.
 *
 * A mismatch is an error, not a warning: the canonical numbers in D-036 exist
 * precisely because an earlier draft said 20 media rows when the real figure
 * was 26 — which would have shipped six broken images.
 */
function assertCounts(stage: StageName, actual: StageCounts): void {
  const expected = EXPECTED_COUNTS[stage];
  const problems: string[] = [];

  for (const [table, want] of Object.entries(expected)) {
    const got = actual[table];
    if (got !== want) {
      problems.push(`  ${table}: expected ${String(want)}, inserted ${String(got ?? 0)}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Stage ${stage.toUpperCase()} produced unexpected row counts:\n${problems.join("\n")}`,
    );
  }
}

const RUNNERS: Record<StageName, (client: Client) => Promise<StageCounts>> = {
  s1: runStageS1,
  s2: runStageS2,
  s3: runStageS3,
};

/**
 * 🔴 Re-running an APPLIED stage destroys the owner's edits.
 *
 * The stage ledger makes a bare `npm run seed` a no-op, which hid this: the
 * stages do not merge, they UPSERT the seeded value over whatever is there. A
 * forced `--stage s1` on a live database silently reverts every edited title,
 * quote, question, job and opening hour across 12 tables — verified: an edited
 * `services.title` came back as the seeded string, with no row-count change to
 * show anything had happened.
 *
 * `docs/PRODUCTION-RECONCILIATION.md` already says re-seeding "must not" happen,
 * and the runbook only ever seeds PENDING stages, so requiring an explicit
 * `--force` changes no documented procedure — it just stops the one invocation
 * whose only possible effect is data loss.
 */
function assertNotAlreadyApplied(stage: StageName, done: Set<StageName>, argv: readonly string[]): void {
  if (!done.has(stage)) return;
  if (argv.includes("--force")) {
    process.stdout.write(
      `\n⚠  Stage ${stage.toUpperCase()} has already been applied and --force was given.\n` +
        "   Seeded values will OVERWRITE any later edits to those rows.\n",
    );
    return;
  }
  throw new Error(
    `Stage ${stage.toUpperCase()} has already been applied.\n\n` +
      "Re-running it does not merge — it upserts the seeded values back over the\n" +
      "current rows, reverting every edit the owner has made to them. Nothing has\n" +
      "been changed.\n\n" +
      "If you genuinely intend to discard those edits and restore seeded content:\n\n" +
      `    npm run seed -- --stage ${stage} --force\n`,
  );
}

async function runStage(client: Client, stage: StageName, done: Set<StageName>): Promise<void> {
  assertPrerequisite(stage, done);

  process.stdout.write(`\nStage ${stage.toUpperCase()} …\n`);

  await client.query("BEGIN");
  try {
    const counts = await RUNNERS[stage](client);
    assertCounts(stage, counts);
    await record(client, stage, counts);
    await client.query("COMMIT");

    for (const [table, n] of Object.entries(counts)) {
      process.stdout.write(`  ${table.padEnd(32)} ${String(n)}\n`);
    }
    process.stdout.write(`Stage ${stage.toUpperCase()} ok.\n`);
    done.add(stage);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main(): Promise<void> {
  loadEnvFile();

  // 🔴 FAIL-CLOSED, AND BEFORE ANY CONNECTION. The seed writes content rows and
  // upserts over existing keys, so an unintended target silently overwrites the
  // owner's edits. `loadEnvFile()` prefers `.env.local` — a real Neon string —
  // so without this a bare `npm run seed` reseeds production. Seeding a fresh
  // production database is legitimate, hence confirm-by-name rather than refuse.
  const target = assertTargetAllowed(
    process.env.DATABASE_URL_UNPOOLED,
    process.argv,
    "seed",
  );
  process.stdout.write(`seed target: ${formatTarget(target)}\n`);

  const args = process.argv.slice(2);
  const statusOnly = args.includes("--status");
  const stageArgIndex = args.indexOf("--stage");
  const requested =
    stageArgIndex >= 0 ? (args[stageArgIndex + 1] as StageName | undefined) : undefined;

  if (requested && !ORDER.includes(requested)) {
    throw new Error(`Unknown stage "${requested}". Expected one of: ${ORDER.join(", ")}`);
  }

  await withDirectClient(async (client) => {
    await ensureLedger(client);

    await withMigrationLock(client, async () => {
      const done = await completed(client);

      if (statusOnly) {
        const { rows } = await client.query<{
          stage: string;
          applied_at: Date;
          counts: StageCounts;
        }>("SELECT stage, applied_at, counts FROM _seed_stages ORDER BY stage");

        const synthetic = await syntheticStages(client);

        process.stdout.write("\nSeed stages\n");
        for (const stage of ORDER) {
          const row = rows.find((r) => r.stage === stage);
          const state = !row
            ? "PENDING"
            : synthetic.has(stage)
              ? `SYNTHETIC placeholder from ${row.applied_at.toISOString()} — NOT really applied`
              : `applied ${row.applied_at.toISOString()}`;
          process.stdout.write(`  ${stage.toUpperCase()}  ${state}\n`);
        }
        if (synthetic.size > 0) {
          process.stdout.write(
            `\n⚠  ${synthetic.size} stage(s) hold SYNTHETIC data from \`npm run seed:local-full\`.\n` +
              "   Media URLs there point at Cloudinary's public demo cloud and will render as\n" +
              "   broken images. Run `npm run assets:migrate` then `npm run seed -- --stage s2`\n" +
              "   to replace them, and regenerate the frontend content afterwards.\n",
          );
        }
        return;
      }

      if (requested) {
        assertNotAlreadyApplied(requested, done, args);
        await runStage(client, requested, done);
        return;
      }

      // No explicit stage: run everything whose prerequisites are satisfied and
      // whose inputs exist. S2 needs an upload manifest, so it is skipped with
      // an explanation rather than failing the whole run.
      for (const stage of ORDER) {
        if (done.has(stage)) {
          process.stdout.write(`Stage ${stage.toUpperCase()} already applied — skipping.\n`);
          continue;
        }

        if (stage === "s2" && !isStageS2Possible()) {
          process.stdout.write(
            "\nStage S2 skipped: no media upload manifest found.\n" +
              "  Run `npm run assets:migrate` first — it uploads the 26 in-use assets to\n" +
              "  Cloudinary and writes the manifest S2 reads. S3 is blocked until S2 completes\n" +
              "  because three of its content_block_items rows are D-027 images.\n",
          );
          break;
        }

        await runStage(client, stage, done);
      }
    });
  });
}

main().catch((err: unknown) => {
  process.stderr.write(`\nseed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
