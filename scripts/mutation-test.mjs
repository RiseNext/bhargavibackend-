/**
 * Mutation test for the content pipeline.
 *
 * A generator that silently emits stale or hardcoded output would pass every
 * deep-equality check, because the thing it is compared against is the same
 * stale content. The only way to know the chain is live is to change the
 * DATABASE and watch the change appear downstream.
 *
 * Mutates one row on Neon, re-runs the generator, asserts the new text appears
 * in the emitted file, then restores the row and re-runs again.
 *
 * 🔴 Writes exactly one UPDATE to one column of one row, and restores it in a
 * `finally`. No truncation, no DDL, no destructive helper.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { withNeon } from "./_neon-verify.mjs";

const FRONTEND = resolve(import.meta.dirname, "..", "..", "frontend");
const TARGET = resolve(FRONTEND, "src", "content", "services.ts");
const SLUG = "acupuncture";
const MUTATION = "Acupuncture MUTATION-PROBE-7f2a";

function regenerate() {
  execFileSync("node", ["scripts/generate-content.mjs"], {
    cwd: FRONTEND,
    env: { ...process.env, BACKEND_URL: "http://localhost:3001" },
    stdio: "pipe",
  });
}

let original;
let pass = 0;
let fail = 0;

const check = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
  }
};

try {
  await withNeon(async (q) => {
    const rows = await q("SELECT title FROM services WHERE slug = $1", [SLUG]);
    original = rows[0]?.title;
    if (original === undefined) throw new Error(`No service with slug "${SLUG}"`);
    console.log(`\nBaseline: services.title for "${SLUG}" = ${JSON.stringify(original)}`);

    // ── before ────────────────────────────────────────────────────────────
    regenerate();
    const before = readFileSync(TARGET, "utf8");
    check("the generated file contains the ORIGINAL title", before.includes(original));
    check("and does not yet contain the mutation", !before.includes(MUTATION));

    // ── mutate ────────────────────────────────────────────────────────────
    await q("UPDATE services SET title = $1 WHERE slug = $2", [MUTATION, SLUG]);
    console.log(`\nMutated the database row, regenerating …`);
    regenerate();
    const after = readFileSync(TARGET, "utf8");

    check("🔴 the mutation REACHED the generated content", after.includes(MUTATION),
      "the generator is not reading live data — it would pass deep-equality while emitting stale output");
      // Compare the FIELD, not a substring: "Acupuncture" is both a prefix of
    // the mutated value and a word that appears in other services copy, so a
    // substring check here fails for reasons that say nothing about the chain.
    check(
      "the title FIELD now holds the mutated value, not the original",
      after.includes(`title: ${JSON.stringify(MUTATION)}`) &&
        !after.includes(`title: ${JSON.stringify(original)}`),
    );
  });
} finally {
  if (original !== undefined) {
    await withNeon(async (q) => {
      await q("UPDATE services SET title = $1 WHERE slug = $2", [original, SLUG]);
      const rows = await q("SELECT title FROM services WHERE slug = $1", [SLUG]);
      console.log(`\nRestored: ${JSON.stringify(rows[0]?.title)}`);
    });
    regenerate();
    const restored = readFileSync(TARGET, "utf8");
    check(
      "the generated content is restored",
      restored.includes(`title: ${JSON.stringify(original)}`) && !restored.includes(MUTATION),
    );
  }
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exitCode = fail === 0 ? 0 : 1;
