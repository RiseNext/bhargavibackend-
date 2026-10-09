/**
 * One-off: propagate the decision count 36 → 37 after D-037.
 *
 * X-01's finding was that the count was stated as 12, 22, 27 and 36 across four
 * entry-point documents, and that a session reading a stale figure would never
 * discover the later decisions — missing D-026 alone was a build-breaking
 * omission. So adding a decision means updating every statement of the count,
 * and doing it mechanically rather than by eye.
 *
 * It deliberately SKIPS historical passages — the correction registers exist to
 * show old numbers beside new ones, and rewriting those would destroy the record
 * of what was corrected.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** Replacements applied in order. Each is anchored enough not to over-match. */
const EDITS: Array<{ find: RegExp; replace: string }> = [
  { find: /## \*\*36 approved decisions\.\*\*/g, replace: "## **37 approved decisions.**" },
  { find: /D-001 … D-036 are APPROVED/g, replace: "D-001 … D-037 are APPROVED" },
  { find: /and all \*\*36\*\* decisions/g, replace: "and all **37** decisions" },
  { find: /\*\*36 decisions approved\*\* \(D-001 … D-036\)/g, replace: "**37 decisions approved** (D-001 … D-037)" },
  { find: /All \*\*36\*\* are \*\*binding\*\*/g, replace: "All **37** are **binding**" },
  { find: /\*\*36 decisions approved · no client answer/g, replace: "**37 decisions approved · no client answer" },
  { find: /D-001 … D-036 approved/g, replace: "D-001 … D-037 approved" },
  { find: /\*\*36 decisions are now approved \(D-001 … D-036\)\.\*\*/g, replace: "**37 decisions are now approved (D-001 … D-037).**" },
  { find: /the \*\*36\*\* approved decisions \(D-001 … D-036\)/g, replace: "the **37** approved decisions (D-001 … D-037)" },
  { find: /\*\*36 decisions approved \(D-001 … D-036\)\*\*/g, replace: "**37 decisions approved (D-001 … D-037)**" },
  { find: /- \*\*36 binding decisions\*\*/g, replace: "- **37 binding decisions**" },
  { find: /`DECISIONS\.md` \(all 36\)/g, replace: "`DECISIONS.md` (all 37)" },
];

/**
 * Lines whose numbers are HISTORY, not a current claim. Rewriting these would
 * erase the record of the drift that X-01 found.
 */
const HISTORICAL = [
  /^\| \*\*X-01\*\*/,
  /^\| X-01 \|/,
  /^\| 1 \| \*\*Decision count\*\*/,
  /^\| \*\*A1\*\* \|/,
  /^\| 1 \| `docs\/DECISIONS\.md` \|/,
  /^\| Approved decisions \|/,
  /only authority on the count/,
];

const FILES = [
  "CLAUDE.md",
  "docs/DECISIONS.md",
  "docs/PROGRESS.md",
  "docs/AI-CONTEXT.md",
  "docs/MASTER-PHASE-PLAN.md",
  "docs/MASTER-IMPLEMENTATION-BLUEPRINT.md",
];

let totalChanges = 0;

for (const file of FILES) {
  const path = resolve(ROOT, file);
  const original = readFileSync(path, "utf8");

  const updated = original
    .split("\n")
    .map((line) => {
      if (HISTORICAL.some((h) => h.test(line))) return line;

      let next = line;
      for (const { find, replace } of EDITS) {
        next = next.replace(find, replace);
      }
      if (next !== line) totalChanges += 1;
      return next;
    })
    .join("\n");

  if (updated !== original) {
    writeFileSync(path, updated, "utf8");
    process.stdout.write(`  updated ${file}\n`);
  } else {
    process.stdout.write(`  unchanged ${file}\n`);
  }
}

process.stdout.write(`\n${String(totalChanges)} line(s) changed.\n`);
