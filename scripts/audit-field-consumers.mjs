#!/usr/bin/env node
/**
 * ORPHANED ADMIN FIELD AUDIT — which editable fields reach no visitor?
 *
 * 🔴 THE DEFECT CLASS THIS FINDS. `site.founder.qualifications` is admin-
 * editable, validated, stored, served by the API and emitted into the generated
 * content — and the only reference to it anywhere in the frontend was inside
 * `schema.ts`'s `person()` helper, which nothing calls. An administrator could
 * correct a clinician's credentials and no visitor would ever see it. Every
 * layer reported success; the field simply had no consumer.
 *
 * Nothing existing detects this. `verify:page-copy` covers `content_blocks`
 * only (D-040), and the generator's R-i checks ask whether a value is MISSING
 * or WRONG — never whether anything READS it.
 *
 * Method: take every leaf field the generator actually emits, then look for a
 * consumer in the frontend's pages, components and libs. A field with no
 * consumer is either a real bug or deliberately reserved, and the two are
 * distinguished by the allowlist below rather than by guesswork.
 *
 * Read-only. Touches no database and no network.
 *
 * Usage: node scripts/audit-field-consumers.mjs [--frontend ../frontend]
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const flagIndex = args.indexOf("--frontend");
const FRONTEND = resolve(flagIndex >= 0 ? args[flagIndex + 1] : "../frontend");
const SRC = join(FRONTEND, "src");

if (!existsSync(SRC)) {
  console.error(`No frontend at ${FRONTEND}`);
  process.exit(2);
}

/**
 * Fields with no visible consumer that are NOT bugs, each with its reason.
 *
 * ⚠ An allowlist is the honest way to express this: "unreferenced" and "wrong"
 * are different claims, and a report that conflates them gets ignored. Adding
 * an entry here is a deliberate statement that nothing should render it.
 */
const EXPECTED_UNCONSUMED = new Map([
  /*
   * ⚠ `site.brandColor` was listed here with the reason "consumed by
   * theme-color metadata". That reason was FALSE, and removing it is the point:
   * `layout.tsx:56` hardcodes `themeColor: "#3d2a1e"` while `brandColor` is
   * "#44683d" — a different colour. So it is a genuine orphan AND a
   * contradiction, and an allowlist entry would have buried both behind a
   * plausible sentence. An allowlist is only as honest as its reasons.
   */
  ["service.updatedAt", "SEO-01: feeds sitemap lastModified, never rendered."],
  ["post.updatedAt", "dateModified in BlogPosting JSON-LD, never rendered."],
  ["post.seoTitle", "generateMetadata only."],
  ["post.seoDescription", "generateMetadata only."],
  ["testimonial.rating", "🔴 D-036: TestimonialCard renders 5 HARDCODED stars. Never wire this."],
  ["testimonial.givenOn", "`when` is the displayed free text; this is the raw date."],
  ["testimonial.practitioner", "No surface shows a per-testimonial practitioner."],
  ["job.slug", "Reserved for a future /careers/[slug] detail page."],
]);

/** Every source file that could consume content. */
function sources() {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
    }
  };
  walk(join(SRC, "app"));
  walk(join(SRC, "components"));
  walk(join(SRC, "lib"));
  return out
    // The generated modules declare the fields; they are not consumers.
    .filter((p) => !p.includes(`${sep}content${sep}`))
    .filter((p) => !p.endsWith(`lib${sep}site.ts`))
    .map((p) => ({
      file: p.replace(FRONTEND, "").split(sep).join("/"),
      // Comments are stripped: a field named only in prose explaining why it is
      // unused would otherwise read as a consumer.
      text: readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " "),
    }));
}

const FILES = sources();

/** Does any source file reference this leaf name as an identifier? */
function consumers(leaf) {
  const re = new RegExp(`\\b${leaf}\\b`);
  return FILES.filter((f) => re.test(f.text)).map((f) => f.file);
}

/**
 * The fields to audit, grouped by the shape that carries them.
 *
 * Taken from the generator's emitters rather than from the database, because
 * the emitters are what the frontend can actually see — a column the generator
 * drops is a different (and already-tested) concern.
 */
const GROUPS = [
  ["site", ["name", "shortName", "tagline", "description", "locale", "email",
            "priceRange", "mapsUrl", "mapEmbedSrc", "logo", "logoLockup",
            "brandColor", "ogImage"]],
  ["site.founder", ["honorific", "qualifications", "role", "photo"]],
  ["service", ["slug", "title", "excerpt", "image", "duration", "treats",
               "body", "priceFrom", "typicalCourse", "updatedAt"]],
  ["testimonial", ["quote", "when", "featured", "rating", "givenOn", "practitioner"]],
  ["video", ["title", "translation", "featured"]],
  ["job", ["slug", "title", "type", "branch", "experience", "excerpt",
           "responsibilities", "requirements"]],
  ["faq", ["question", "answer"]],
  ["stat", ["value", "suffix", "label", "heroLabel", "showInHero"]],
  ["post", ["title", "excerpt", "cover", "author", "tags", "publishedAt",
            "readingMinutes", "updatedAt", "seoTitle", "seoDescription"]],
  ["pageMeta", ["canonical", "ogImage", "noindex"]],
];

console.log(`Auditing admin-managed fields against ${String(FILES.length)} frontend source files\n`);

const orphans = [];
const allowed = [];
const lowCount = [];

for (const [group, leaves] of GROUPS) {
  const rows = [];
  for (const leaf of leaves) {
    const found = consumers(leaf);
    const key = `${group}.${leaf}`;
    const expected = EXPECTED_UNCONSUMED.get(key);
    if (found.length === 0) {
      if (expected) allowed.push([key, expected]);
      else orphans.push([key, "NO CONSUMER"]);
      rows.push(`    ${expected ? "·" : "🔴"} ${leaf.padEnd(18)} ${expected ? "unconsumed (expected)" : "NO CONSUMER"}`);
    } else if (found.length <= 2) {
      /*
       * 🔴 THIS TOOL'S OWN BLIND SPOT, made visible.
       *
       * `site.founder.qualifications` — the bug that motivated this audit — had
       * exactly ONE reference, inside `schema.ts`'s `person()` helper, which
       * nothing calls. A bare count would have printed "1 consumer" and looked
       * healthy, so this audit would have MISSED the very defect it was written
       * for. Low counts therefore print their files: one reference, or one
       * sitting inside a known-orphaned helper, is for a reader to judge rather
       * than to trust.
       */
      rows.push(`    ⚠ ${leaf.padEnd(18)} ${String(found.length)}: ${found.join(", ")}`);
      lowCount.push([key, found]);
    } else {
      rows.push(`    ✅ ${leaf.padEnd(18)} ${String(found.length)} consumer(s)`);
    }
  }
  console.log(`  ${group}`);
  console.log(rows.join("\n"));
}

console.log(`\n  Deliberately unconsumed (${String(allowed.length)}):`);
for (const [k, why] of allowed) console.log(`    · ${k} — ${why}`);

console.log(`\n  ⚠ FEW consumers — check each is live code (${String(lowCount.length)}):`);
for (const [k, files] of lowCount) console.log(`    ⚠ ${k} -> ${files.join(", ")}`);

console.log(`\n  🔴 ORPHANED, needs a decision (${String(orphans.length)}):`);
if (orphans.length === 0) console.log("    none");
for (const [k] of orphans) console.log(`    🔴 ${k}`);

if (orphans.length > 0) process.exitCode = 1;
