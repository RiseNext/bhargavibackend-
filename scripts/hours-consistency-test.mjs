/**
 * Prove that changing the hours in the database moves EVERY surface.
 *
 * That was the whole point of the cleanup. Before it, four places carried the
 * hours and only one of them was generated — so an admin edit moved the footer
 * and left the live badge, the service page and the `MedicalClinic` structured
 * data stating the old times. A site that contradicts itself about when it is
 * open is worse than one that is merely out of date, because a visitor cannot
 * tell which answer to trust.
 *
 * Mutates `branches.hours` in Neon, rebuilds, and asserts the new time appears
 * on every surface AND the old time appears on none. Restores in a `finally`.
 *
 * 🔴 One UPDATE to one column. No truncation, no DDL.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { withNeon } from "./_neon-verify.mjs";

const FRONTEND = resolve(import.meta.dirname, "..", "..", "frontend");
const NEXT_BIN = resolve(FRONTEND, "node_modules", "next", "dist", "bin", "next");

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

function run(cmd, args, env = {}) {
  execFileSync(cmd, args, {
    cwd: FRONTEND,
    // Clean env: this process has the BACKEND .env.local loaded, and its
    // NODE_ENV confuses `next build` into a misleading /404 prerender error.
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

const generateAndBuild = () => {
  run("node", ["scripts/generate-content.mjs"], { BACKEND_URL: "http://localhost:3001" });
  run("node", [NEXT_BIN, "build"]);
};

/** Read a whole build output tree with the given extension. */
function readTree(dir, ext) {
  const walk = (d) => {
    let out = [];
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = resolve(d, e.name);
      if (e.isDirectory()) out = out.concat(walk(p));
      else if (e.name.endsWith(ext)) out.push(p);
    }
    return out;
  };
  try {
    return walk(dir).map((f) => readFileSync(f, "utf8"));
  } catch {
    return [];
  }
}

/** Static HTML (server-rendered surfaces) and client JS (the live badge). */
const surfaces = () => ({
  html: readTree(resolve(FRONTEND, ".next", "server", "app"), ".html").join("\n"),
  js: readTree(resolve(FRONTEND, ".next", "static"), ".js").join("\n"),
});

let original;

try {
  await withNeon(async (q) => {
    const rows = await q(
      "SELECT hours::text AS hours FROM branches WHERE hours IS NOT NULL ORDER BY sort_order LIMIT 1",
    );
    original = rows[0]?.hours;
    if (!original) throw new Error("no branch with hours");
    console.log(`\nBaseline hours row: ${original.slice(0, 80)}…`);
  });

  // ── 9 PM → 7 PM, every day. A plausible edit, not a malformed one. ────────
  const mutated = original.replaceAll('"21:00"', '"19:00"');
  if (mutated === original) throw new Error("expected a 21:00 close to change");

  await withNeon(async (q) => {
    await q(
      `UPDATE branches SET hours = $1::jsonb
        WHERE hours IS NOT NULL AND id = (
          SELECT id FROM branches WHERE hours IS NOT NULL ORDER BY sort_order LIMIT 1)`,
      [mutated],
    );
  });

  console.log("Closing time changed 9:00 PM → 7:00 PM in Neon. Rebuilding …\n");
  generateAndBuild();
  const after = surfaces();

  // 🔴 Every surface must now say 7:00 PM.
  check(
    "footer / contact (site.hours display shape)",
    after.html.includes("9:00 AM – 7:00 PM"),
    "the generated display shape did not update",
  );
  check(
    "service detail page line (hoursShort)",
    after.html.includes("Mon–Sun · 9:00 AM – 7:00 PM"),
    "the service page is still rendering a literal",
  );
  check(
    "MedicalClinic JSON-LD (openingHoursSpecification)",
    after.html.includes('"closes":"19:00"'),
    "the structured data is still hand-written",
  );
  check(
    "live OpenStatus badge data, in the client bundle",
    after.js.includes("7:00 PM"),
    "OpenStatus still carries its own WINDOWS constant",
  );

  /*
   * 🔴 No CODE-DRIVEN surface may still say 9:00 PM.
   *
   * Scoped deliberately. One FAQ answer reads "Every day, Monday to Sunday,
   * 9:00 AM – 9:00 PM." — authored prose in the `faqs` table, which an
   * administrator edits directly and which correctly does NOT follow a
   * `branches.hours` change. FAQ answers are plain text by decision (they are
   * serialised into FAQPage JSON-LD), so deriving one from the hours would
   * both break that and invent content.
   *
   * So this asserts the absence of the stale time everywhere EXCEPT inside a
   * FAQ answer — which is the real property: no code renders a stale time.
   */
  const htmlWithoutFaqProse = after.html.replaceAll(
    "Every day, Monday to Sunday, 9:00 AM – 9:00 PM.",
    "[faq-answer]",
  );
  check(
    "🔴 no code-driven surface still says 9:00 PM",
    !htmlWithoutFaqProse.includes("9:00 PM") && !after.js.includes("9:00 PM"),
    `html=${String(htmlWithoutFaqProse.includes("9:00 PM"))} js=${String(after.js.includes("9:00 PM"))}`,
  );
  check(
    "the FAQ answer is unchanged — it is admin-authored prose, not derived",
    after.html.includes("Every day, Monday to Sunday, 9:00 AM – 9:00 PM."),
  );
  check(
    "🔴 no stale 21:00 left in the structured data",
    !after.html.includes('"closes":"21:00"'),
  );
} finally {
  if (original) {
    await withNeon(async (q) => {
      await q(
        `UPDATE branches SET hours = $1::jsonb
          WHERE hours IS NOT NULL AND id = (
            SELECT id FROM branches WHERE hours IS NOT NULL ORDER BY sort_order LIMIT 1)`,
        [original],
      );
      const rows = await q(
        "SELECT hours::text AS hours FROM branches WHERE hours IS NOT NULL ORDER BY sort_order LIMIT 1",
      );
      console.log(`\nRestored hours row: ${String(rows[0]?.hours).slice(0, 80)}…`);
      if (rows[0]?.hours !== original) console.log("  🔴 RESTORE MISMATCH");
    });

    console.log("Rebuilding from restored hours …\n");
    generateAndBuild();
    const back = surfaces();
    check("9:00 PM is back on every surface", back.html.includes("9:00 AM – 9:00 PM"));
    check("service page line restored", back.html.includes("Mon–Sun · 9:00 AM – 9:00 PM"));
    check("JSON-LD restored to 21:00", back.html.includes('"closes":"21:00"'));
    check("badge data restored", back.js.includes("9:00 PM"));
    check("🔴 no trace of the 7:00 PM probe remains", !back.html.includes("7:00 PM") && !back.js.includes("7:00 PM"));
  }
}

console.log(`\n  ${String(pass)} passed, ${String(fail)} failed\n`);
process.exitCode = fail === 0 ? 0 : 1;
