/**
 * Documentation consistency check.
 *
 * The master investigation's single most common finding was DOCUMENTATION DRIFT:
 * the decision count was stated as 12, 22, 27 and 36 in four different files;
 * `media` seed rows as 20 and 26; `content_blocks` as "~35", "~46", "~47" and
 * 67. A wrong count is not cosmetic — "20 media rows" would have shipped six
 * broken images, and a session reading "22 decisions" would never have
 * discovered D-026 and would have produced a dead deployment.
 *
 * D-036 made those figures canonical. This script is the CI step that keeps them
 * that way, plus it asserts the forbidden environment variables stay absent from
 * `.env.example` (D-034).
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DOCS = resolve(ROOT, "docs");

interface Problem {
  file: string;
  message: string;
}

const problems: Problem[] = [];

/** Files that record history and may legitimately quote a superseded figure. */
const DRIFT_EXEMPT = new Set([
  // The correction registers exist to show the OLD numbers next to the new ones.
  "MASTER-IMPLEMENTATION-BLUEPRINT.md",
  "DECISIONS.md",
  "MASTER-PHASE-PLAN.md",
  "REQUIREMENTS-COMPARISON.md",
  "AI-CONTEXT.md",
  "IMPLEMENTATION-PLAN.md",
  "FRONTEND-AUDIT.md",
  "HARDCODED-CONTENT-MAP.md",
  "MEDIA-STORAGE-DESIGN.md",
  "CAREERS-DESIGN.md",
  "DATABASE-DESIGN-DRAFT.md",
  "API-DESIGN-DRAFT.md",
  "SECURITY-DESIGN.md",
  "BRANCH-ARCHITECTURE.md",
  "PROGRESS.md",
  "OPEN-QUESTIONS.md",
  "PROJECT-PRD.md",
  "DECISIONS-PROPOSALS.md",
]);

function docFiles(): string[] {
  if (!existsSync(DOCS)) return [];
  return readdirSync(DOCS).filter((f) => f.endsWith(".md"));
}

/**
 * Patterns that assert a canonical figure. Each is a claim phrased so that a
 * stale number is a positive match rather than needing a count of its own.
 */
const FORBIDDEN_CLAIMS: Array<{ pattern: RegExp; why: string }> = [
  {
    // D-038 moved the count to 38. The range is checked rather than the bare
    // number because "D-001 … D-036" is the form that actually misleads a
    // session into never discovering the later decisions (X-01).
    pattern: /\b(?:D-001\s*(?:…|\.\.\.|-)\s*D-0(?:12|22|27|35|36|37|38))\b/,
    why: "decision range must be D-001 … D-039 (D-039 is the latest)",
  },
  {
    // Both word orders. "37 decisions approved" slipped past the original
    // pattern, which only matched "approved decisions" — the stale count then
    // sat one line away from a correct D-001 … D-038 range.
    pattern: /\b(?:22|27|12|36|37|38)\s+(?:approved\s+decisions|decisions\s+approved)\b/i,
    why: "the approved decision count is 39",
  },
  {
    // 🔴 D-038 — the site sends no email. A document that still instructs
    // someone to create a Resend account would have them provision a provider
    // the client explicitly refused, and put a live key where the boot gate
    // now rejects it.
    pattern: /create (?:a |an )?Resend account|Resend → Vercel|sign up (?:for|to) Resend/i,
    why: "D-038 removed all outbound mail — there is no Resend account to create",
  },
  {
    pattern: /\bmedia\b[^.\n]{0,40}\b20\s+rows\b/i,
    why: "media seeds 26 rows, not 20 (D-036)",
  },
  {
    pattern: /\b135\s+(?:paths|operations|endpoints)\b/,
    why: "the API surface is 134 operations across 91 paths (D-036)",
  },
  {
    pattern: /\b14\s+unreferenced\b/i,
    why: "there are 19 unreferenced images (D-036)",
  },
  {
    pattern: /DELETE\s+\/api\/admin\/branches\/\{id\}/,
    why: "this endpoint does not exist (D-025 / D-036) — branches are deactivated via PATCH",
  },
];

/**
 * Markers that make a line a QUOTATION of a stale figure rather than an
 * assertion of it.
 *
 * This distinction is the difference between a useful check and a check that
 * punishes documenting a correction. `PROJECT-OVERVIEW.md` and
 * `IMPLEMENTATION-STATUS.md` both legitimately say what the old text *claimed*,
 * and a lint that forbade that would push the correction out of the record —
 * which is exactly the behaviour that produced the drift in the first place.
 */
const HISTORICAL_MARKERS = [
  "claimed",
  "stated",
  "earlier revision",
  "an earlier",
  "stale",
  "was wrongly",
  "previously",
  "superseded",
  "corrected",
  "no longer",
  "used to",
  "~~",
];

function isHistoricalLine(line: string): boolean {
  const l = line.toLowerCase();
  return HISTORICAL_MARKERS.some((m) => l.includes(m));
}

for (const file of docFiles()) {
  if (DRIFT_EXEMPT.has(file)) continue;

  const lines = readFileSync(resolve(DOCS, file), "utf8").split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    // Prose wraps, so a quoted stale figure often lands on the line AFTER the
    // word that marks it as historical. Checking a small window rather than a
    // single line is what makes the distinction hold for real markdown.
    const context = [lines[index - 1] ?? "", line, lines[index + 1] ?? ""].join(" ");
    if (isHistoricalLine(context)) continue;

    for (const { pattern, why } of FORBIDDEN_CLAIMS) {
      if (pattern.test(line)) {
        problems.push({ file: `docs/${file}:${String(index + 1)}`, message: why });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// D-034 — forbidden environment variables
// ---------------------------------------------------------------------------

const FORBIDDEN_ENV = [
  "CONTACT_TO_EMAIL",
  "CAREERS_TO_EMAIL",
  "STORAGE_PROVIDER",
  "REVALIDATE_URL",
  "REVALIDATE_SECRET",
  "NEXT_PUBLIC_API_URL",
];

const envExamplePath = resolve(ROOT, ".env.example");
if (existsSync(envExamplePath)) {
  const lines = readFileSync(envExamplePath, "utf8").split(/\r?\n/);

  for (const name of FORBIDDEN_ENV) {
    // Only an ACTIVE assignment is a problem. The template documents each
    // forbidden group as forbidden, in comments, so it cannot be reintroduced
    // by someone filling gaps — those mentions must not trip the check.
    const active = lines.some((l) => new RegExp(`^\\s*${name}\\s*=`).test(l));
    if (active) {
      problems.push({
        file: ".env.example",
        message: `${name} is forbidden by D-034 and must not be assigned`,
      });
    }
  }

  // The two Neon endpoints must both be present (D-017).
  for (const required of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "FIELD_ENCRYPTION_KEYS"]) {
    if (!lines.some((l) => new RegExp(`^\\s*${required}\\s*=`).test(l))) {
      problems.push({ file: ".env.example", message: `${required} is missing` });
    }
  }
} else {
  problems.push({ file: ".env.example", message: "file is missing" });
}

// ---------------------------------------------------------------------------
// Snapshot immutability
// ---------------------------------------------------------------------------

const snapshot = resolve(DOCS, "CURRENT-FRONTEND-CONTENT");
if (!existsSync(snapshot)) {
  problems.push({
    file: "docs/CURRENT-FRONTEND-CONTENT",
    message: "🔒 the content snapshot is missing — it is the only record of the original content",
  });
}

// ---------------------------------------------------------------------------

if (problems.length > 0) {
  process.stderr.write("\ndocs:lint found inconsistencies:\n\n");
  for (const p of problems) {
    process.stderr.write(`  ${p.file}\n    ${p.message}\n`);
  }
  process.stderr.write("\n");
  process.exitCode = 1;
} else {
  process.stdout.write("docs:lint ok\n");
}
