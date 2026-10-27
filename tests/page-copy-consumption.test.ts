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

  /*
   * ⚠ This replaced `consumed === emitted`.
   *
   * Equal totals held only while every editable field had exactly one ordinary
   * consumer. Four fields now do not, because the client asked for four UI
   * elements to be removed and the rows were kept so the owner can restore them
   * from the admin panel — see `RETAINED` in the gate. The old assertion failed
   * on that, for something that is not a defect.
   *
   * 🔴 And equal totals were the weaker check regardless: they are equal just as
   * happily when a pattern double-counts one call site and misses another. The
   * gate now reconciles the two sets arithmetically — each key classified
   * exactly once, counted from both directions — and reports `balance OK` only
   * when the identity holds. That is what is asserted here.
   */
  it("reconciles the emitted and consumed sets, over a non-trivial number of fields", () => {
    const out = execFileSync("npx", ["tsx", GATE], {
      cwd: ROOT,
      encoding: "utf8",
      shell: true,
    });

    const emitted = /emitted\s+(\d+)/.exec(out);
    const consumed = /consumed\s+(\d+)/.exec(out);
    const balance = /balance\s+OK — (\d+) key/.exec(out);

    // 🔴 The zero case matters: a gate that found no fields at all would also
    // print "every emitted field has a consumer".
    expect(Number(emitted?.[1])).toBeGreaterThan(100);
    expect(Number(consumed?.[1])).toBeGreaterThan(100);

    expect(out).not.toContain("THE SETS DO NOT RECONCILE");
    expect(balance?.[1], "the gate must report a satisfied balance").toBeDefined();
    expect(Number(balance?.[1])).toBeGreaterThan(100);

    // The only permitted gap between the two totals is the register plus the
    // optional fields a page reads through `copy.maybe()` and the generator does
    // not emit. Anything else and the identity above would not have held.
    const retained = /retained\s+(\d+)/.exec(out);
    const optional = /optional\s+(\d+)/.exec(out);
    expect(Number(emitted?.[1]) - Number(consumed?.[1])).toBeLessThanOrEqual(
      Number(retained?.[1]) + Number(optional?.[1]),
    );
  });

  it("🔴 the retained register cannot go stale in either direction", () => {
    const out = execFileSync("npx", ["tsx", GATE], {
      cwd: ROOT,
      encoding: "utf8",
      shell: true,
    });

    // A registered field that regains a consumer, or that the generator stops
    // emitting, must fail — otherwise the register becomes a place to park an
    // orphan and forget about it.
    expect(out).not.toContain("NOW HAVE A CONSUMER");
    expect(out).not.toContain("ARE NO LONGER EMITTED");

    // Every entry is printed on every run, passing or failing: a field an owner
    // can edit and watch do nothing must not vanish into a green tick.
    const gate = readFileSync(GATE, "utf8");
    for (const key of ["contact.hero.lead", "global.ctaBand.cta"]) {
      expect(gate, `${key} must stay registered with its reason`).toContain(key);
      expect(out, `${key} must be reported on a passing run`).toContain(key);
    }
    // The allowlist must stay small enough to read. It is an exception list,
    // not a mode.
    expect(Number(/retained\s+(\d+)/.exec(out)?.[1])).toBeLessThanOrEqual(6);
  });

  /*
   * 🔴 `copy.maybe()` is the one reader that does not throw on a missing field.
   *
   * The gate used to treat it like `copy.text()` and reported
   * `contact.messageBlock.label` — written as
   * `copy.maybe("contact", "messageBlock", "label") ?? "Leave a message"` — as
   * a call site that breaks the build. No build has ever broken on it. The
   * distinction that matters is narrower than "maybe is safe": `maybe()` calls
   * `block()` first, which DOES throw when the whole slot is missing, so the
   * slot must still be emitted.
   */
  it("🔴 a copy.maybe() field may be absent; its SLOT may not", () => {
    const out = execFileSync("npx", ["tsx", GATE], {
      cwd: ROOT,
      encoding: "utf8",
      shell: true,
    });

    expect(out).not.toContain("DOES NOT EMIT");
    expect(Number(/optional\s+(\d+)/.exec(out)?.[1])).toBeGreaterThan(0);

    // The slot-level requirement must still be enforced, not dropped along with
    // the field-level one.
    const gate = readFileSync(GATE, "utf8");
    expect(gate).toContain("emittedSlots");
    expect(gate).toMatch(/optional\.has\(k\)/);

    // And the real frontend call site is the shape described above: an optional
    // read with its own fallback, not a bare `copy.text`.
    const contactPage = readFileSync(
      resolve(ROOT, "..", "frontend", "src", "app", "contact", "page.tsx"),
      "utf8",
    );
    expect(contactPage).toMatch(
      /copy\.maybe\(\s*"contact",\s*"messageBlock",\s*"label"\s*\)\s*\?\?/,
    );
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
