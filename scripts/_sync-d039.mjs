/**
 * Propagate the decision count 38 → 39 after D-039, and record the verified
 * Cloudinary state in the entry-point documents.
 *
 * Mechanical rather than by eye, for the reason X-01 recorded: the count was
 * once stated as 12, 22, 27 and 36 in four different files, and a session
 * reading a stale figure never discovers the later decisions.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const edits = [
  ["CLAUDE.md", "**Decisions D-001 … D-038 are APPROVED and binding**", "**Decisions D-001 … D-039 are APPROVED and binding**"],
  ["CLAUDE.md", "All **38** are **binding**.", "All **39** are **binding**."],
  ["CLAUDE.md", "38 decisions approved", "39 decisions approved"],
  [
    "CLAUDE.md",
    "| **D-038** | 🔴 **The website sends NO EMAIL.**",
    "| **D-039** | Cloudinary behaviour **verified**: `max_bytes` is neither signable nor enforced · the Admin API reports no `format` for `raw` · the bounded read needs `private_download_url`. Corrects D-031's mechanisms |\n| **D-038** | 🔴 **The website sends NO EMAIL.**",
  ],
  ["docs/DECISIONS.md", "## **38 approved decisions.**", "## **39 approved decisions.**"],
  ["docs/PROGRESS.md", "38 decisions approved", "39 decisions approved"],
  ["docs/PROGRESS.md", "D-001 … D-038 approved", "D-001 … D-039 approved"],
  ["docs/PROJECT-OVERVIEW.md", "**38 decisions approved** (D-001 … D-038)", "**39 decisions approved** (D-001 … D-039)"],
  ["docs/AI-CONTEXT.md", "the **38** approved decisions (D-001 … D-038)", "the **39** approved decisions (D-001 … D-039)"],
  ["docs/AI-CONTEXT.md", "**38 decisions approved (D-001 … D-038)**", "**39 decisions approved (D-001 … D-039)**"],
  ["docs/AI-CONTEXT.md", "> **38 decisions are now approved (D-001 … D-038).**", "> **39 decisions are now approved (D-001 … D-039).**"],
  // docs:lint must now treat "D-001 … D-038" as the stale form.
  ["scripts/docs-lint.ts", "D-0(?:12|22|27|35|36|37)", "D-0(?:12|22|27|35|36|37|38)"],
  ["scripts/docs-lint.ts", 'why: "decision range must be D-001 … D-038 (D-038 is the latest)"', 'why: "decision range must be D-001 … D-039 (D-039 is the latest)"'],
  ["scripts/docs-lint.ts", "pattern: /\\b(?:22|27|12|36|37)\\s+(?:approved\\s+decisions|decisions\\s+approved)\\b/i", "pattern: /\\b(?:22|27|12|36|37|38)\\s+(?:approved\\s+decisions|decisions\\s+approved)\\b/i"],
  ["scripts/docs-lint.ts", 'why: "the approved decision count is 38"', 'why: "the approved decision count is 39"'],
];

let applied = 0;
const missed = [];

for (const [file, from, to] of edits) {
  const path = resolve(ROOT, file);
  const before = readFileSync(path, "utf8");
  if (!before.includes(from)) {
    missed.push(`${file}: ${from.slice(0, 60)}`);
    continue;
  }
  writeFileSync(path, before.replace(from, to), "utf8");
  applied++;
}

process.stdout.write(`applied ${String(applied)}/${String(edits.length)} edit(s)\n`);
for (const m of missed) process.stdout.write(`  NOT FOUND  ${m}\n`);
