/**
 * Human-quotable reference numbers.
 *
 *   submissions   BHW-E-2026-0042   (E for enquiry)
 *   applications  BHW-2026-0042     — the key that links an emailed CV to its
 *                                     record, so an applicant can quote it
 *
 * ⚠ X-33: these are GUESSABLE BY DESIGN, because they are read out over the
 * phone. A reference is an identifier, never an authorisation token — every
 * endpoint keyed on one is rate limited and returns a constant-time 404.
 */

import { query } from "./db";

export type ReferenceKind = "submission" | "application";

const PREFIX: Record<ReferenceKind, string> = {
  submission: "BHW-E",
  application: "BHW",
};

const TABLE: Record<ReferenceKind, string> = {
  submission: "submissions",
  application: "applications",
};

function format(kind: ReferenceKind, year: number, counter: number): string {
  return `${PREFIX[kind]}-${String(year)}-${String(counter).padStart(4, "0")}`;
}

/**
 * Allocates the next reference for the current year.
 *
 * Derived from a count rather than a sequence so the number restarts each
 * January, which is what makes it readable on the phone. A concurrent insert can
 * produce the same candidate; the caller retries on the unique-index violation,
 * which at this volume happens essentially never and costs one retry when it
 * does.
 */
export async function nextReference(kind: ReferenceKind, attempt = 0): Promise<string> {
  const year = new Date().getUTCFullYear();

  const rows = await query<{ n: string }>(
    // Table name is interpolated from a closed internal map, never from input.
    `SELECT count(*)::text AS n FROM ${TABLE[kind]}
      WHERE created_at >= make_timestamptz($1, 1, 1, 0, 0, 0, 'UTC')`,
    [year],
  );

  const used = Number(rows[0]?.n ?? "0");
  // Each retry steps forward, so a collision resolves rather than repeating.
  return format(kind, year, used + 1 + attempt);
}

/** Shape check only — never an authorisation decision. */
export function looksLikeReference(value: string, kind: ReferenceKind): boolean {
  const pattern =
    kind === "submission" ? /^BHW-E-\d{4}-\d{4,}$/ : /^BHW-\d{4}-\d{4,}$/;
  return pattern.test(value);
}
