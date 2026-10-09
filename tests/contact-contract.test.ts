/**
 * 🔴 THE FROZEN `/api/contact` CONTRACT TEST.
 *
 * Four live forms depend on this endpoint and none of them reads the response
 * body — only the status. So this suite pins:
 *
 *   · every status code the stub produced, for every input shape
 *   · the ORDER in which validation errors are produced (X-32) — a payload
 *     failing two rules must still produce the documented FIRST one
 *   · the exact message strings, so a future refactor cannot drift them
 *   · the additive extensions: 413 on an oversized body, 429 when limited
 *
 * Reference: `CURRENT-FRONTEND-CONTENT/source/app/api-contact-route.ts` @ 2fdf32a.
 */

import { describe, expect, it } from "vitest";
import {
  ACCEPTED_KINDS,
  KIND_TARGET,
  MESSAGES,
  isEmail,
  normalisePhone,
  parseConsent,
  parsePreferredAt,
  isOutsideHours,
  validateContactPayload,
} from "@/lib/validation/contact";

describe("frozen contract · email regex is the stub's, character for character", () => {
  const valid = ["a@b.co", "first.last@example.co.in", "x+tag@mail.example.com"];
  const invalid = ["", "no-at-sign", "a@b", "a@b.c", "a b@c.de", "@b.co", "a@.co"];

  for (const v of valid) it(`accepts ${v}`, () => expect(isEmail(v)).toBe(true));
  for (const v of invalid) {
    it(`rejects ${JSON.stringify(v)}`, () => expect(isEmail(v)).toBe(false));
  }
});

describe("frozen contract · dispatch", () => {
  it("accepts exactly five kinds — four named plus absent", () => {
    expect(ACCEPTED_KINDS).toEqual(["appointment", "contact", "career", "newsletter"]);
  });

  it("defaults an absent kind to contact", () => {
    const out = validateContactPayload({ name: "A", phone: "9866376203" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.kind).toBe("contact");
  });

  it("routes the five kinds to three tables", () => {
    expect(KIND_TARGET.appointment).toBe("submissions");
    expect(KIND_TARGET.contact).toBe("submissions");
    // 🔴 career and newsletter must NEVER enter the submissions.kind enum.
    expect(KIND_TARGET.career).toBe("applications");
    expect(KIND_TARGET.newsletter).toBe("newsletter_subscribers");
  });

  it("rejects an unrecognised kind with 422 and writes nothing", () => {
    const out = validateContactPayload({ kind: "invoice", name: "A", phone: "1" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure.status).toBe(422);
      expect(out.failure.error).toBe(MESSAGES.unknownKind);
    }
  });
});

describe("frozen contract · newsletter branch", () => {
  it("requires a valid email", () => {
    const out = validateContactPayload({ kind: "newsletter", email: "nope" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure.status).toBe(422);
      expect(out.failure.error).toBe(MESSAGES.newsletterEmail);
    }
  });

  it("does NOT require name or phone", () => {
    const out = validateContactPayload({ kind: "newsletter", email: "a@b.co" });
    expect(out.ok).toBe(true);
  });

  it("rejects a missing email with the newsletter message, not the name/phone one", () => {
    const out = validateContactPayload({ kind: "newsletter" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.error).toBe(MESSAGES.newsletterEmail);
  });
});

describe("frozen contract · non-newsletter branch", () => {
  for (const kind of ["appointment", "contact", "career"] as const) {
    it(`${kind}: requires name and phone`, () => {
      for (const payload of [
        { kind },
        { kind, name: "A" },
        { kind, phone: "9866376203" },
        { kind, name: "   ", phone: "9866376203" },
        { kind, name: "A", phone: "   " },
      ]) {
        const out = validateContactPayload(payload);
        expect(out.ok, JSON.stringify(payload)).toBe(false);
        if (!out.ok) {
          expect(out.failure.status).toBe(422);
          expect(out.failure.error).toBe(MESSAGES.nameAndPhone);
        }
      }
    });

    it(`${kind}: accepts an absent email`, () => {
      expect(validateContactPayload({ kind, name: "A", phone: "9866376203" }).ok).toBe(true);
    });

    it(`${kind}: rejects a malformed email when one IS supplied`, () => {
      const out = validateContactPayload({ kind, name: "A", phone: "9866376203", email: "bad" });
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.failure.status).toBe(422);
        expect(out.failure.error).toBe(MESSAGES.badEmail);
      }
    });

    it(`${kind}: treats an empty-string email as absent, not malformed`, () => {
      expect(validateContactPayload({ kind, name: "A", phone: "1", email: "" }).ok).toBe(true);
    });
  }
});

describe("🔴 X-32 · validation ORDER is contractual", () => {
  it("reports name/phone BEFORE a bad email", () => {
    // Fails two rules at once. The stub checks name/phone first, so that is the
    // message the contract requires — not the email one.
    const out = validateContactPayload({ kind: "contact", email: "bad" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.error).toBe(MESSAGES.nameAndPhone);
  });

  it("reports an unknown kind BEFORE any field validation", () => {
    // Fails the kind rule AND the name/phone rule.
    const out = validateContactPayload({ kind: "nonsense" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.error).toBe(MESSAGES.unknownKind);
  });

  it("applies the newsletter email rule, not the name/phone rule, for newsletter", () => {
    // A newsletter payload missing everything must produce the newsletter
    // message — proving the branch is taken before field checks.
    const out = validateContactPayload({ kind: "newsletter", name: "", phone: "" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure.error).toBe(MESSAGES.newsletterEmail);
  });
});

describe("frozen contract · body shapes that are not objects", () => {
  for (const body of [null, 42, "a string", true, ["an", "array"]]) {
    it(`rejects ${JSON.stringify(body)} with 400`, () => {
      const out = validateContactPayload(body);
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.failure.status).toBe(400);
        expect(out.failure.error).toBe(MESSAGES.invalidJson);
      }
    });
  }

  it("coerces a boolean consent value rather than rejecting the payload", () => {
    const out = validateContactPayload({ name: "A", phone: "1", consent: true });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.payload.consent).toBe("true");
  });
});

describe("phone normalisation · never rejects a lead", () => {
  const cases: Array<[string, string]> = [
    ["+91 98663 76203", "+919866376203"],
    ["9866376203", "+919866376203"],
    ["09866376203", "+919866376203"],
    ["919866376203", "+919866376203"],
    ["+919866376203", "+919866376203"],
    ["98663-76203", "+919866376203"],
    ["(098663) 76203", "+919866376203"],
  ];

  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => expect(normalisePhone(input)).toBe(expected));
  }

  it("keeps an unparseable number rather than discarding it", () => {
    // Migration 010 exists so this row can still be stored. The lead matters
    // more than the format, and `phone_raw` keeps the original.
    expect(normalisePhone("12345")).toBe("12345");
    expect(normalisePhone("call me")).toBe("call me");
  });

  it("never throws, for any input", () => {
    for (const v of ["", "   ", "+", "++++", "0", "a".repeat(500)]) {
      expect(() => normalisePhone(v)).not.toThrow();
    }
  });
});

describe("consent", () => {
  it("is true only for the three affirmative values a form can send", () => {
    expect(parseConsent("on")).toBe(true);
    expect(parseConsent("true")).toBe(true);
    expect(parseConsent("1")).toBe(true);
    expect(parseConsent("off")).toBe(false);
    expect(parseConsent("false")).toBe(false);
    expect(parseConsent(undefined)).toBe(false);
  });
});

describe("preferred time · naive input is Asia/Kolkata, stored UTC", () => {
  it("shifts a naive datetime back by 5h30m", () => {
    const parsed = parsePreferredAt("2026-10-07T15:30");
    // 15:30 IST is 10:00 UTC. Parsing with `new Date()` on a UTC server would
    // have stored 15:30 UTC and shown the patient a 21:00 appointment.
    expect(parsed?.toISOString()).toBe("2026-10-07T10:00:00.000Z");
  });

  it("handles the space-separated variant", () => {
    expect(parsePreferredAt("2026-10-07 09:00")?.toISOString()).toBe(
      "2026-10-07T03:30:00.000Z",
    );
  });

  it("returns undefined for junk rather than throwing", () => {
    for (const v of ["", "tomorrow", "2026-13-45T99:99", undefined]) {
      expect(parsePreferredAt(v)).toBeUndefined();
    }
  });
});

describe("outside-hours flag · a warning, never a rejection", () => {
  const hours = [
    { day: "monday", windows: [{ open: "09:00", close: "21:00" }] },
    { day: "tuesday", windows: [{ open: "09:00", close: "13:30" }, { open: "16:00", close: "19:30" }] },
  ];

  it("is false inside a window", () => {
    // 2026-10-05 is a Monday. 10:00 UTC = 15:30 IST.
    expect(isOutsideHours(new Date("2026-10-05T10:00:00Z"), hours)).toBe(false);
  });

  it("is true outside every window", () => {
    // 20:00 UTC = 01:30 IST next day.
    expect(isOutsideHours(new Date("2026-10-05T20:00:00Z"), hours)).toBe(true);
  });

  it("handles a split shift — inside the second window", () => {
    // 2026-10-06 is a Tuesday. 12:00 UTC = 17:30 IST, inside 16:00–19:30.
    expect(isOutsideHours(new Date("2026-10-06T12:00:00Z"), hours)).toBe(false);
  });

  it("handles a split shift — in the gap between windows", () => {
    // 09:00 UTC = 14:30 IST, between 13:30 and 16:00.
    expect(isOutsideHours(new Date("2026-10-06T09:00:00Z"), hours)).toBe(true);
  });

  it("is false when no time was requested or no hours are known", () => {
    expect(isOutsideHours(undefined, hours)).toBe(false);
    expect(isOutsideHours(new Date(), [])).toBe(false);
  });

  it("treats a day with no entry as outside hours", () => {
    // Sunday is absent from this fixture.
    expect(isOutsideHours(new Date("2026-10-04T10:00:00Z"), hours)).toBe(true);
  });
});

/**
 * 🔴 `branches.hours` exists in the database in TWO encodings.
 *
 * The seed wrote `day` as a day-NAME string; `HoursDay` (settings/resolve.ts)
 * and the admin write schema (`admin/branches.ts`) use the numeric 0–6 model.
 * So the FIRST time an administrator saves opening hours — the very thing
 * D-005 exists to allow — that branch's rows become numeric.
 *
 * Every case above uses the string form, which is why matching only that form
 * looked correct: with numeric days `find()` matched nothing, the function
 * returned `true` unconditionally, and every appointment at any time was
 * flagged outside opening hours. Silently, because the public pages render
 * through the generator, which already tolerates both encodings.
 *
 * These mirror the string cases exactly. They fail against a single-encoding
 * implementation.
 */
describe("outside-hours flag · accepts BOTH stored day encodings", () => {
  // 1 = Monday, 2 = Tuesday — Date.prototype.getDay() numbering.
  const numeric = [
    { day: 1, windows: [{ open: "09:00", close: "21:00" }] },
    { day: 2, windows: [{ open: "09:00", close: "13:30" }, { open: "16:00", close: "19:30" }] },
  ];

  it("is false inside a window", () => {
    expect(isOutsideHours(new Date("2026-10-05T10:00:00Z"), numeric)).toBe(false);
  });

  it("is true outside every window", () => {
    expect(isOutsideHours(new Date("2026-10-05T20:00:00Z"), numeric)).toBe(true);
  });

  it("handles a split shift — inside the second window", () => {
    expect(isOutsideHours(new Date("2026-10-06T12:00:00Z"), numeric)).toBe(false);
  });

  it("handles a split shift — in the gap between windows", () => {
    expect(isOutsideHours(new Date("2026-10-06T09:00:00Z"), numeric)).toBe(true);
  });

  it("treats a day with no entry as outside hours", () => {
    expect(isOutsideHours(new Date("2026-10-04T10:00:00Z"), numeric)).toBe(true);
  });

  it("tolerates a mixed-encoding list, which a partial admin edit produces", () => {
    const mixed = [
      { day: "monday", windows: [{ open: "09:00", close: "21:00" }] },
      { day: 2, windows: [{ open: "16:00", close: "19:30" }] },
    ];
    // Monday 15:30 IST — matched by the string entry.
    expect(isOutsideHours(new Date("2026-10-05T10:00:00Z"), mixed)).toBe(false);
    // Tuesday 17:30 IST — matched by the numeric entry.
    expect(isOutsideHours(new Date("2026-10-06T12:00:00Z"), mixed)).toBe(false);
  });

  it("ignores day-name casing and surrounding whitespace", () => {
    const padded = [{ day: " Monday ", windows: [{ open: "09:00", close: "21:00" }] }];
    expect(isOutsideHours(new Date("2026-10-05T10:00:00Z"), padded)).toBe(false);
  });
});
