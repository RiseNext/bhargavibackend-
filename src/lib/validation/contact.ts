/**
 * 🔴 THE FROZEN `/api/contact` CONTRACT.
 *
 * Four live forms are built against this endpoint and **none of them reads the
 * response body** — only the HTTP status (`FormStatus` prints a hardcoded
 * fallback at `fields.tsx:174`). The strings below therefore exist for
 * operators, not visitors; the STATUS CODES and the ORDER are the contract.
 *
 * ⚠ X-32: the validation ORDER is part of the contract, not just the set of
 * messages. A payload failing two rules must still produce the documented
 * first one. The order is pinned here and asserted by a contract test.
 *
 * Derived from the live stub (`src/app/api/contact/route.ts` @ 2fdf32a):
 *
 *   1.  body too large          → 413   (additive; no form sends >10 KB)
 *   2.  JSON unparseable        → 400   "Invalid JSON body."
 *   3.  kind = body.kind ?? "contact"
 *   4.  kind not recognised     → 422   (dispatch rule, DB design §2.1)
 *   5.  kind === "newsletter"   → email must be valid → 422
 *       otherwise               → name AND phone required → 422
 *                               → email, IF PRESENT, must be valid → 422
 *   6.  rate limited            → 429   (additive, fails open)
 *   7.  success                 → 200   { ok, kind, reference }
 *
 * Extensions are additive only. `reference` was added to the 200 body, which is
 * safe precisely because no form reads it.
 */

/** The regex from the live stub, character for character. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: unknown): boolean {
  return typeof value === "string" && value !== "" && EMAIL_RE.test(value);
}

/** The five accepted kinds. Anything else is rejected and nothing is written. */
export const ACCEPTED_KINDS = [
  "appointment",
  "contact",
  "career",
  "newsletter",
] as const;

export type AcceptedKind = (typeof ACCEPTED_KINDS)[number];

/** Which table a kind is written to (DB design §2.1). */
export const KIND_TARGET: Record<AcceptedKind, "submissions" | "applications" | "newsletter_subscribers"> = {
  appointment: "submissions",
  contact: "submissions",
  // 🔴 `career` and `newsletter` must NEVER enter the submissions.kind enum.
  career: "applications",
  newsletter: "newsletter_subscribers",
};

export interface ValidationFailure {
  status: 400 | 422;
  error: string;
}

export type ValidationOutcome =
  | { ok: true; kind: AcceptedKind; payload: Record<string, string> }
  | { ok: false; failure: ValidationFailure };

/** Exact message strings. Changing one of these changes the contract. */
export const MESSAGES = {
  invalidJson: "Invalid JSON body.",
  newsletterEmail: "A valid email address is required.",
  nameAndPhone: "Name and phone number are required.",
  badEmail: "That email address doesn't look right.",
  unknownKind: "Unsupported form kind.",
} as const;

function asStringMap(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // The live forms post flat JSON strings. A boolean consent checkbox arrives
    // as "on"/"true", so booleans are coerced rather than rejected.
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "boolean" || typeof v === "number") out[k] = String(v);
    else if (v === null || v === undefined) continue;
    else return undefined;
  }
  return out;
}

/**
 * Validates a parsed body in the frozen order.
 *
 * `parsedBody` is whatever `JSON.parse` produced; the 400 for unparseable input
 * is raised by the caller before this runs, because the cap check must precede
 * it.
 */
export function validateContactPayload(parsedBody: unknown): ValidationOutcome {
  const payload = asStringMap(parsedBody);
  if (!payload) {
    // A non-object or a nested object is not something any form sends; the stub
    // would have thrown on property access, so 400 is the faithful answer.
    return { ok: false, failure: { status: 400, error: MESSAGES.invalidJson } };
  }

  // Step 3 — the documented default when `kind` is absent.
  const rawKind = payload.kind ?? "contact";

  // Step 4 — dispatch rule: anything else is rejected, nothing written.
  if (!ACCEPTED_KINDS.includes(rawKind as AcceptedKind)) {
    return { ok: false, failure: { status: 422, error: MESSAGES.unknownKind } };
  }
  const kind = rawKind as AcceptedKind;

  // Step 5 — the branch, in the stub's exact order.
  if (kind === "newsletter") {
    if (!isEmail(payload.email)) {
      return { ok: false, failure: { status: 422, error: MESSAGES.newsletterEmail } };
    }
  } else {
    if (!payload.name?.trim() || !payload.phone?.trim()) {
      return { ok: false, failure: { status: 422, error: MESSAGES.nameAndPhone } };
    }
    // Only when present — an absent email is valid on both forms.
    if (payload.email && !isEmail(payload.email)) {
      return { ok: false, failure: { status: 422, error: MESSAGES.badEmail } };
    }
  }

  return { ok: true, kind, payload };
}

// ---------------------------------------------------------------------------
// Field normalisation
// ---------------------------------------------------------------------------

/** Application-layer caps (API design §2.3). Values are truncated, never rejected. */
export const CAPS = {
  name: 200,
  email: 320,
  phone: 40,
  message: 2000,
  service: 120,
  branch: 120,
  role: 200,
  experience: 200,
  sourcePage: 300,
  consentText: 500,
} as const;

export function cap(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Best-effort E.164 for an Indian clinic's traffic.
 *
 * 🔴 This NEVER throws and never rejects. A mistyped number must still produce
 * a stored lead (see migration 010): `phone_raw` keeps the submitted string and
 * the admin inbox shows both, so an unnormalisable number is visible rather
 * than lost.
 */
export function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (digits === "") return trimmed.slice(0, CAPS.phone);

  // Already international.
  if (hasPlus && digits.length >= 8 && digits.length <= 15) return `+${digits}`;

  // 10-digit Indian mobile.
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;

  // 91 + 10 digits.
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;

  // Trunk-prefixed 0XXXXXXXXXX.
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;

  // 00 international prefix.
  if (digits.length > 12 && digits.startsWith("00")) return `+${digits.slice(2)}`;

  // Unrecognised shape: keep the digits, marked as non-normalised by the absence
  // of a country code. Deliberately not discarded.
  return digits.slice(0, CAPS.phone);
}

/** Consent is true only for the three affirmative values the forms can send. */
export function parseConsent(value: string | undefined): boolean {
  return value === "on" || value === "true" || value === "1";
}

/**
 * Parses the form's naive `datetime-local` string as Asia/Kolkata and returns
 * UTC.
 *
 * `new Date("2026-10-07T15:30")` is interpreted in the SERVER's zone, which on
 * Railway is UTC — that would shift every requested appointment by 5½ hours.
 * The offset is applied explicitly instead.
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

export function parsePreferredAt(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;

  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return undefined;

  const [, y, mo, d, h, mi] = m;
  if (!y || !mo || !d || !h || !mi) return undefined;

  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);

  const utcMs = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(utcMs)) return undefined;

  // `Date.UTC` ROLLS OVER out-of-range components rather than failing: month 13
  // day 45 hour 99 becomes a perfectly valid date 16 months later. Comparing the
  // components back is what rejects it — otherwise a typo turns into a
  // confident-looking appointment time nobody asked for.
  const check = new Date(utcMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    return undefined;
  }

  return new Date(utcMs - IST_OFFSET_MINUTES * 60_000);
}

/**
 * Flags a requested time outside opening hours.
 *
 * ⚠ A WARNING ONLY — never a rejection. The clinic would rather have the lead
 * and call the patient back.
 */
export function isOutsideHours(
  preferredAt: Date | undefined,
  windows: ReadonlyArray<{
    // 🔴 BOTH encodings occur in live data. The seed wrote `day` as a day-NAME
    // string; `HoursDay` and the admin write schema use the numeric 0–6 model,
    // so the first hours edit an administrator saves converts a branch to
    // numbers. Matching only one encoding made this function return `true` for
    // every time of every day after that edit — flagging every appointment as
    // out-of-hours, silently, because the public pages render from the
    // generator, which already tolerates both.
    day: string | number;
    windows: ReadonlyArray<{ open: string; close: string }>;
  }>,
): boolean {
  if (!preferredAt || windows.length === 0) return false;

  // Convert back to IST to compare against local opening times.
  const ist = new Date(preferredAt.getTime() + IST_OFFSET_MINUTES * 60_000);
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayNumber = ist.getUTCDay();
  const dayName = dayNames[dayNumber];
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();

  const day = windows.find((w) =>
    typeof w.day === "number"
      ? w.day === dayNumber
      : w.day.trim().toLowerCase() === dayName,
  );
  if (!day || day.windows.length === 0) return true;

  return !day.windows.some((w) => {
    const open = toMinutes(w.open);
    const close = toMinutes(w.close);
    if (open === undefined || close === undefined) return false;
    return minutes >= open && minutes <= close;
  });
}

function toMinutes(hhmm: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m || !m[1] || !m[2]) return undefined;
  return Number(m[1]) * 60 + Number(m[2]);
}
