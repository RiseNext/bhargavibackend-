/**
 * The PUB-02 consumption gate itself.
 *
 * `verify-page-copy-consumed.mts` is what proves no editable field is orphaned,
 * so its own matching has to be trustworthy. A regex that silently failed to
 * recognise `copy.action(...)` would report every CTA as an orphan; one that
 * matched too loosely would report a clean sheet while fields went unread. Both
 * directions are checked here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

import {
  CODE_OWNED_FIELDS,
  CODE_OWNED_FIELD_COUNT,
  codeOwnedFieldKeys,
} from "../scripts/seed/code-owned-fields";
import { EXTRA_ALLOWLIST } from "../src/lib/content/extra-allowlist";

const ROOT = resolve(import.meta.dirname, "..");
const GATE = resolve(ROOT, "scripts", "verify-page-copy-consumed.mts");

describe("D-040 · the consumption gate", () => {
  it("passes against the committed frontend — 0 orphans, 0 leaks, 0 phantoms", () => {
    // Runs the real gate rather than re-implementing it: a test that duplicated
    // the reconciliation could agree with a broken gate.
    const out = execFileSync("npx", ["tsx", GATE], {
      cwd: ROOT,
      encoding: "utf8",
      shell: true,
    });

    expect(out).toContain("Every emitted field has a consumer");
    expect(out).not.toContain("ORPHANED");
    expect(out).not.toContain("LEAKED");
  });

  it("reports equal emitted and consumed counts, and they are not zero", () => {
    const out = execFileSync("npx", ["tsx", GATE], {
      cwd: ROOT,
      encoding: "utf8",
      shell: true,
    });

    const emitted = /emitted\s+(\d+)/.exec(out);
    const consumed = /consumed\s+(\d+)/.exec(out);
    expect(emitted?.[1]).toBeDefined();
    expect(consumed?.[1]).toBeDefined();

    // 🔴 The zero case matters: a gate that found no fields at all would also
    // print "every emitted field has a consumer".
    expect(Number(emitted?.[1])).toBeGreaterThan(100);
    expect(Number(consumed?.[1])).toBe(Number(emitted?.[1]));
  });

  it("still reports the canonical 41 slots", () => {
    const out = execFileSync("npx", ["tsx", GATE], {
      cwd: ROOT,
      encoding: "utf8",
      shell: true,
    });
    expect(out).toMatch(/slots\s+41\b/);
  });
});

describe("D-040 · every helper the gate must recognise is recognised", () => {
  const source = readFileSync(GATE, "utf8");

  // Each reader exported by frontend/src/lib/copy.ts consumes a field, so each
  // must appear in the gate's patterns. Forgetting one turns real consumers
  // into phantom orphans.
  const READERS = [
    "text",
    "maybe",
    "heading",
    "body",
    "extra",
    "extraObject",
    "noteWithRequiredGlyph",
    "withLeadIn",
    "items",
    "cta",
    "action",
    "destination",
    "block",
  ];

  it.each(READERS)("the gate matches copy.%s()", (reader) => {
    expect(source).toContain(reader);
  });

  it("the frontend exports nothing the gate does not know about", () => {
    const copySource = readFileSync(
      resolve(ROOT, "..", "frontend", "src", "lib", "copy.ts"),
      "utf8",
    );
    const exported = [...copySource.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);

    // `item` and `itemText` are the only readers that do not name a NEW field:
    // `item` indexes a group `items()` already covers, and `itemText` narrows a
    // row already in hand.
    const accounted = new Set([...READERS, "item", "itemText"]);
    const unknown = exported.filter((name) => name !== undefined && !accounted.has(name));
    expect(unknown).toEqual([]);
  });
});

describe("D-040 · the classification stays internally consistent", () => {
  it("CODE_OWNED_FIELD_COUNT matches the map", () => {
    expect(codeOwnedFieldKeys()).toHaveLength(CODE_OWNED_FIELD_COUNT);
  });

  it("every code-owned field carries the evidence that justifies it", () => {
    for (const [slot, fields] of CODE_OWNED_FIELDS) {
      for (const [field, owned] of Object.entries(fields)) {
        const where = `${slot}.${field}`;
        // `Partial<Record<…>>` makes every value optional, so an entry present
        // as a key but holding `undefined` would skip every assertion below.
        expect(owned, where).toBeDefined();
        if (owned === undefined) continue;
        expect(owned.jsx, `${where}.jsx`).toBeTruthy();
        // `file.tsx`, `file.tsx:42` or `file.tsx:42-52` — a single line or a range.
        expect(owned.source, `${where}.source`).toMatch(/\.tsx?(:\d+(-\d+)?)?$/);
        expect(owned.derivesFrom, `${where}.derivesFrom`).toBeTruthy();
      }
    }
  });

  it("🔴 the three careers format-descriptions are NOT editable", () => {
    // They stored "<type> · <branch> · <experience>" and the like — a
    // description of a format, not copy. An editable field there is either
    // inert or renders literal angle brackets on the page.
    const jobCards = EXTRA_ALLOWLIST["careers.jobCards"] ?? [];
    expect(jobCards).not.toContain("indexBadge");
    expect(jobCards).not.toContain("metaLine");
    expect(jobCards).not.toContain("modalAriaLabel");

    // …while the five that ARE real copy stay editable.
    expect([...jobCards].sort()).toEqual([
      "applyButton",
      "modalCloseLabel",
      "modalLabel",
      "requirementsHeading",
      "responsibilitiesHeading",
    ]);
  });

  it("the earlier allowlist removals are still removed", () => {
    expect(EXTRA_ALLOWLIST["home.hero"] ?? []).not.toContain("supportingCopy");
    expect(EXTRA_ALLOWLIST["careers.apply"] ?? []).not.toContain("resumeInstruction");
    expect(EXTRA_ALLOWLIST["careers.openings"] ?? []).not.toContain("asideTitle");
  });
});
