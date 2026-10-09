/**
 * Migration 014 must not drift from the classification it implements.
 *
 * 🔴 THE RISK. `014_reconcile_code_owned_content.sql` enumerates page/slot
 * pairs as literal SQL, because SQL cannot import `CODE_OWNED_FIELDS`. If
 * somebody adds an 18th code-owned field, the seed stops storing it and the
 * consumption gate stays green — but PRODUCTION keeps the stale value forever,
 * because no migration clears it. This file is the link between the two: every
 * code-owned field and every de-allowlisted `extra` key must appear in the
 * migration's text.
 *
 * The behavioural proof is `npm run verify:reconciliation`, which rehearses the
 * migration against a disposable database (idempotency, content preservation,
 * the dead-button rule). This file only guards completeness.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CODE_OWNED_FIELDS, CODE_OWNED_FIELD_COUNT } from "../scripts/seed/code-owned-fields";

const ROOT = resolve(import.meta.dirname, "..");
const sql = readFileSync(
  resolve(ROOT, "migrations", "014_reconcile_code_owned_content.sql"),
  "utf8",
);

/**
 * The statements only, with `--` comments stripped.
 *
 * 🔴 The prose in this migration is long and deliberately quotes SQL and stored
 * values, so scanning the raw text finds matches that are documentation rather
 * than code: the first version of the table assertion below "found" a table
 * called `or`, from the sentence "a conditional UPDATE or a DELETE".
 */
const statements = sql.replace(/--[^\n]*/g, "");

/**
 * Whether the migration targets a slot, in EITHER form it legitimately uses:
 * the tuple form `(page, slot) IN (('home', 'hero'))` for the column clears,
 * and the single-row form `page = 'careers' AND slot = 'apply'` for the
 * per-slot `extra` key removals.
 */
const targets = (page: string, slot: string): boolean =>
  statements.includes(`('${page}', '${slot}')`) ||
  new RegExp(`page = '${page}'\\s+AND slot = '${slot}'`).test(statements);

describe("migration 014 covers every code-owned field", () => {
  const entries: Array<{ page: string; slot: string; field: string }> = [];
  for (const [key, fields] of CODE_OWNED_FIELDS) {
    const [page = "", slot = ""] = key.split(".");
    for (const field of Object.keys(fields)) entries.push({ page, slot, field });
  }

  it("the classification is the expected size", () => {
    expect(entries).toHaveLength(CODE_OWNED_FIELD_COUNT);
  });

  it.each(entries.map((e) => [`${e.page}.${e.slot}`, e.field, e] as const))(
    "%s.%s is reconciled",
    (_slot, _field, entry) => {
      if (entry.field.startsWith("extra.")) {
        const key = entry.field.slice("extra.".length);
        expect(statements, `extra key ${key}`).toContain(`'${key}'::text`);
      }
      expect(targets(entry.page, entry.slot), `${entry.page}.${entry.slot}`).toBe(true);
    },
  );

  it("clears each text column that can hold a code-owned value", () => {
    for (const column of ["title", "label", "lead"]) {
      expect(statements, column).toContain(`UPDATE content_blocks SET ${column} = NULL`);
    }
    expect(statements).toContain("SET cta2_label = NULL, cta2_href = NULL");
    expect(statements).toContain("SET cta_label = NULL");
  });

  it("🔴 clears the expression-as-href defect", () => {
    // `global.ctaBand.cta2_href` stored the literal text `site.phones[0].href`,
    // which is not a URL. The migration's predicate must reach that slot.
    expect(targets("global", "ctaBand")).toBe(true);
    expect(statements).toContain("SET cta2_label = NULL, cta2_href = NULL");
  });

  it("🔴 KEEPS the editable half of a split CTA", () => {
    // about.story and home.testimonials lose only their derived LABEL. Had the
    // migration cleared cta_href too, it would have destroyed a destination the
    // owner can legitimately edit.
    expect(statements).toContain("SET cta_label = NULL");
    expect(statements).not.toContain("SET cta_label = NULL, cta_href = NULL");
    expect(targets("about", "story")).toBe(true);
    expect(targets("home", "testimonials")).toBe(true);
  });

  it("removes every de-allowlisted extra key", () => {
    for (const key of [
      "indexBadge",
      "metaLine",
      "modalAriaLabel",
      "supportingCopy",
      "resumeInstruction",
      "asideTitle",
    ]) {
      expect(statements, key).toContain(`'${key}'::text`);
    }
  });

  it("does NOT remove a key that is still allowlisted", () => {
    for (const key of [
      "applyButton",
      "modalLabel",
      "modalCloseLabel",
      "requirementsHeading",
      "responsibilitiesHeading",
      "callLabel",
      "formRoleDefault",
      "asideLead",
      "sinceCard",
      "formCardNote",
      "formCardTitle",
      "pullQuote",
      "pullQuoteCaption",
      "captionBelow",
      "bigNumeral",
      "secondary",
      "note",
      "lastUpdated",
    ]) {
      expect(statements, key).not.toContain(`'${key}'::text`);
    }
  });
});

describe("migration 014 is written to be idempotent and non-destructive", () => {
  it("every UPDATE is guarded by a predicate that stops matching", () => {
    const updates = statements.match(/UPDATE content_blocks[\s\S]*?;/g) ?? [];
    expect(updates.length).toBeGreaterThan(5);
    for (const stmt of updates) {
      expect(stmt, stmt.slice(0, 70)).toContain("WHERE");
    }
  });

  it("🔴 deletes nothing except the one portrait item row", () => {
    const deletes = statements.match(/DELETE FROM [\s\S]*?;/g) ?? [];
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain("content_block_items");
    expect(deletes[0]).toContain("'portrait'");
    // 🔴 The media row is shared with site_settings.founder_photo_media_id, so
    // deleting it would break the portrait everywhere it renders.
    expect(statements).not.toMatch(/DELETE FROM\s+media/);
  });

  it("drops no column, constraint or table, and truncates nothing", () => {
    expect(statements).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT)\b/i);
    expect(statements).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("touches no table other than the two content tables", () => {
    const tables = new Set(
      [...statements.matchAll(/(?:UPDATE|DELETE FROM|INSERT INTO)\s+([a-z_]+)/g)].map(
        (m) => m[1],
      ),
    );
    expect([...tables].sort()).toEqual(["content_block_items", "content_blocks"]);
  });
});
