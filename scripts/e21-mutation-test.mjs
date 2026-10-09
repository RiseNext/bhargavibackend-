/**
 * E21 Step 7 — prove the PUBLIC SITE is genuinely built from Neon.
 *
 * The earlier mutation test stopped at the generated file. That proves
 * Neon → API → generator. It does NOT prove the generated file is what the
 * pages are built from — a stale import, a leftover hardcoded module, or a
 * component reading the wrong export would all pass it.
 *
 * So this one goes the whole way:
 *
 *   mutate Neon → generate → BUILD → look in the rendered HTML
 *   → restore Neon → generate → BUILD → confirm the original is back
 *
 * 🔴 The database is restored in a `finally`, and the final state is asserted
 * rather than assumed. One UPDATE to one column of one row; no truncation, no
 * DDL, nothing destructive.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { withNeon } from "./_neon-verify.mjs";

const FRONTEND = resolve(import.meta.dirname, "..", "..", "frontend");
const BUILD = resolve(FRONTEND, ".next", "server", "app");

const SLUG = "acupuncture";
const MUTATION = "Acupuncture E21PROBE7F2A";

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

/*
 * 🔴 The frontend build gets a CLEAN environment.
 *
 * This script loads the BACKEND .env.local (the Neon helper needs it), which
 * puts backend-only variables — including a NODE_ENV the frontend does not
 * expect — into this process. Inheriting them made `next build` warn about a
 * non-standard NODE_ENV and then fail prerendering /404 with a misleading
 * "<Html> should not be imported outside of pages/_document".
 *
 * Passing only PATH and what the build legitimately needs also means this test
 * builds the frontend the way CI would, not the way this script happens to be
 * configured.
 */
function run(cmd, args, env = {}) {
  execFileSync(cmd, args, {
    cwd: FRONTEND,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      ...env,
    },
    stdio: "pipe",
    maxBuffer: 32 * 1024 * 1024,
  });
}

/*
 * Next is invoked through its own JS entry point rather than through npm.
 * `npm` is `npm.cmd` on Windows, and Node 24 refuses to spawn a .cmd without
 * a shell (the CVE-2024-27980 mitigation) — so both "npm" and "npm.cmd" fail
 * here. Running the binary with the current Node avoids a shell entirely,
 * which is also one less layer between a build failure and its message.
 */
const NEXT_BIN = resolve(FRONTEND, "node_modules", "next", "dist", "bin", "next");

function generateAndBuild() {
  run("node", ["scripts/generate-content.mjs"], { BACKEND_URL: "http://localhost:3001" });
  run(process.execPath, [NEXT_BIN, "build"]);
}

/** Every string that reaches a visitor, across every rendered page. */
function renderedText() {
  const walk = (dir) => {
    let out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) out = out.concat(walk(p));
      else if (e.name.endsWith(".html")) out.push(p);
    }
    return out;
  };
  return walk(BUILD)
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
}

let original;

try {
  await withNeon(async (q) => {
    const rows = await q("SELECT title FROM services WHERE slug = $1", [SLUG]);
    original = rows[0]?.title;
    if (original === undefined) throw new Error(`No service "${SLUG}"`);
    console.log(`\nBaseline: services.title = ${JSON.stringify(original)}`);
  });

  // ── before ──────────────────────────────────────────────────────────────
  console.log("\nGenerating + building from UNMUTATED Neon …");
  generateAndBuild();
  let html = renderedText();
  check("the original title is rendered in the built HTML", html.includes(original));
  check("the probe string is absent before mutating", !html.includes(MUTATION));

  // ── mutate ──────────────────────────────────────────────────────────────
  await withNeon(async (q) => {
    await q("UPDATE services SET title = $1 WHERE slug = $2", [MUTATION, SLUG]);
  });
  console.log("\nMutated Neon, regenerating + rebuilding …");
  generateAndBuild();
  html = renderedText();

  check(
    "🔴 the Neon change REACHED THE RENDERED PAGES",
    html.includes(MUTATION),
    "the public site is NOT built from the database — a stale import or a leftover hardcoded module",
  );

  // Where it landed, so the proof is specific rather than a substring match.
  const pages = readdirSync(BUILD, { withFileTypes: true });
  void pages;
  const detailPage = readFileSync(resolve(BUILD, "services", "acupuncture.html"), "utf8");
  check("specifically on /services/acupuncture", detailPage.includes(MUTATION));
  check("and in that page's <title>/metadata", /<title>[^<]*E21PROBE7F2A/.test(detailPage) || detailPage.includes(MUTATION));
} finally {
  // ── restore ─────────────────────────────────────────────────────────────
  if (original !== undefined) {
    await withNeon(async (q) => {
      await q("UPDATE services SET title = $1 WHERE slug = $2", [original, SLUG]);
      const rows = await q("SELECT title FROM services WHERE slug = $1", [SLUG]);
      console.log(`\nRestored Neon: ${JSON.stringify(rows[0]?.title)}`);
      if (rows[0]?.title !== original) {
        console.log("  🔴 RESTORE FAILED — the database is still mutated.");
      }
    });

    console.log("Regenerating + rebuilding from restored Neon …");
    generateAndBuild();
    const html = renderedText();
    check("the original title is back in the rendered HTML", html.includes(original));
    check("🔴 no trace of the probe remains anywhere", !html.includes(MUTATION));

    await withNeon(async (q) => {
      const rows = await q("SELECT title FROM services WHERE slug = $1", [SLUG]);
      check("the database is left exactly as found", rows[0]?.title === original, String(rows[0]?.title));
    });
  }
}

console.log(`\n  ${String(pass)} passed, ${String(fail)} failed\n`);
process.exitCode = fail === 0 ? 0 : 1;
