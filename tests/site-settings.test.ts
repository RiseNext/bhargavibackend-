/**
 * E9 / 8a verification gate — `GET /api/site-settings`.
 *
 * The load-bearing test here is the **D-029 Bowenpally case**, asserted against
 * the ACTUAL SEEDED DATA rather than a fixture: `is_primary` is Bowenpally and
 * its address, geo, maps and hours are all NULL, so a resolver that trusted
 * `is_primary` would silently empty the footer address, both `/contact` cards,
 * the AppointmentBand Visit row, the `/careers` hours line and the
 * `PostalAddress` + `GeoCoordinates` JSON-LD — with a green build.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { describeDb, seedStageS1, withClient } from "./helpers/db";
import { closeDb, query } from "@/lib/db";
import {
  buildSiteSettings,
  derivePhones,
  deriveBranches,
  loadBranches,
  whatsappHref,
} from "@/lib/settings/site-settings";
import {
  hasValue,
  missingRequiredGlobals,
  resolveBranchFor,
  resolveGlobals,
  type ResolvableBranch,
} from "@/lib/settings/resolve";

// ---------------------------------------------------------------------------
// Unit — the resolver, with hand-built branches
// ---------------------------------------------------------------------------

function branch(overrides: Partial<ResolvableBranch>): ResolvableBranch {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    slug: "x",
    name: "X",
    isPrimary: false,
    isActive: true,
    sortOrder: 1,
    phoneSortOrder: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    phoneLabel: null,
    phoneE164: null,
    whatsappE164: null,
    addressLine1: null,
    addressLine2: null,
    addressCity: null,
    addressState: null,
    addressPostal: null,
    addressCountry: null,
    addressFull: null,
    lat: null,
    lng: null,
    mapsUrl: null,
    mapEmbedSrc: null,
    hours: null,
    notifyEmail: null,
    ...overrides,
  };
}

const FULL_ADDRESS = {
  addressLine1: "H. No 1-8-539/1/a",
  addressCity: "Hyderabad",
  addressPostal: "500020",
};

describe("D-029 · hasValue", () => {
  it("requires line1 AND city AND postal — a partial address is NOT a value", () => {
    expect(hasValue(branch(FULL_ADDRESS), "address")).toBe(true);

    // Each one missing, individually. A half address renders as if deliberate,
    // which is worse than rendering nothing.
    expect(hasValue(branch({ ...FULL_ADDRESS, addressLine1: null }), "address")).toBe(false);
    expect(hasValue(branch({ ...FULL_ADDRESS, addressCity: null }), "address")).toBe(false);
    expect(hasValue(branch({ ...FULL_ADDRESS, addressPostal: null }), "address")).toBe(false);
  });

  it("treats a blank string as absent", () => {
    expect(hasValue(branch({ ...FULL_ADDRESS, addressCity: "   " }), "address")).toBe(false);
    expect(hasValue(branch({ mapsUrl: "  " }), "mapsUrl")).toBe(false);
  });

  it("requires BOTH coordinates", () => {
    expect(hasValue(branch({ lat: 17.4, lng: 78.5 }), "geo")).toBe(true);
    expect(hasValue(branch({ lat: 17.4 }), "geo")).toBe(false);
    expect(hasValue(branch({ lng: 78.5 }), "geo")).toBe(false);
  });

  it("accepts a zero coordinate — 0 is a real latitude, not a missing value", () => {
    expect(hasValue(branch({ lat: 0, lng: 0 }), "geo")).toBe(true);
  });

  it("requires at least one day with at least one window", () => {
    expect(hasValue(branch({ hours: [] }), "hours")).toBe(false);
    expect(hasValue(branch({ hours: [{ day: 1, windows: [] }] }), "hours")).toBe(false);
    expect(
      hasValue(branch({ hours: [{ day: 1, windows: [{ open: "09:00", close: "21:00" }] }] }), "hours"),
    ).toBe(true);
  });
});

describe("🔴 D-029 · resolution never trusts is_primary", () => {
  // Exactly the live situation: the primary branch sorts second and holds
  // nothing; the non-primary branch sorts first and holds everything.
  const bowenpally = branch({
    slug: "bowenpally",
    name: "Bowenpally",
    isPrimary: true,
    sortOrder: 2,
    phoneSortOrder: 1,
    phoneLabel: "+91 70751 57013",
    phoneE164: "+917075157013",
    whatsappE164: "+917075157013",
  });

  const chikkadpally = branch({
    slug: "chikkadpally",
    name: "Chikkadpally",
    isPrimary: false,
    sortOrder: 1,
    phoneSortOrder: 2,
    phoneLabel: "+91 98663 76203",
    phoneE164: "+919866376203",
    whatsappE164: "+919866376203",
    ...FULL_ADDRESS,
    addressFull: "H. No 1-8-539/1/a, … Hyderabad, Telangana - 500020",
    lat: 17.405174930115965,
    lng: 78.49652574603265,
    mapsUrl: "https://maps.app.goo.gl/XLX7hEATPodxRXa4A",
    mapEmbedSrc: "https://www.google.com/maps?q=17.4,78.4&z=16&output=embed",
    hours: [{ day: 1, windows: [{ open: "09:00", close: "21:00" }] }],
  });

  const branches = [bowenpally, chikkadpally];

  it("resolves every location field to the NON-primary branch", () => {
    for (const field of ["address", "geo", "mapsUrl", "mapEmbedSrc", "hours"] as const) {
      expect(resolveBranchFor(branches, field)?.slug, field).toBe("chikkadpally");
    }
  });

  it("records provenance so the admin can explain the behaviour to an editor", () => {
    const resolved = resolveGlobals(branches);
    expect(resolved.provenance).toEqual({
      address: "chikkadpally",
      geo: "chikkadpally",
      mapsUrl: "chikkadpally",
      mapEmbedSrc: "chikkadpally",
      hours: "chikkadpally",
    });
  });

  it("would have produced NOTHING had it used is_primary — the actual bug", () => {
    // Proof the rule is load-bearing: the primary branch holds no value for any
    // of the five fields, so an `is_primary` resolver yields five nulls.
    for (const field of ["address", "geo", "mapsUrl", "mapEmbedSrc", "hours"] as const) {
      expect(hasValue(bowenpally, field), field).toBe(false);
    }
  });

  it("resolves PER FIELD — two branches may each supply a different one", () => {
    const hoursOnly = branch({
      slug: "hours-only",
      sortOrder: 0,
      hours: [{ day: 2, windows: [{ open: "10:00", close: "13:30" }] }],
    });

    const resolved = resolveGlobals([...branches, hoursOnly]);
    // `hours-only` sorts first and wins hours; address still comes from
    // Chikkadpally, because resolution is per field and not per branch.
    expect(resolved.provenance.hours).toBe("hours-only");
    expect(resolved.provenance.address).toBe("chikkadpally");
  });

  it("ignores inactive branches entirely", () => {
    const resolved = resolveGlobals([
      bowenpally,
      { ...chikkadpally, isActive: false },
    ]);
    expect(resolved.address).toBeNull();
    expect(missingRequiredGlobals(resolved)).toEqual(["address", "geo", "hours"]);
  });

  it("breaks a sort_order tie by created_at, deterministically", () => {
    const older = branch({ slug: "older", sortOrder: 5, createdAt: new Date("2020-01-01"), ...FULL_ADDRESS });
    const newer = branch({ slug: "newer", sortOrder: 5, createdAt: new Date("2026-01-01"), ...FULL_ADDRESS });
    expect(resolveBranchFor([newer, older], "address")?.slug).toBe("older");
  });

  it("flags address, geo and hours as required — the fail-loud set", () => {
    expect(missingRequiredGlobals(resolveGlobals([bowenpally]))).toEqual([
      "address",
      "geo",
      "hours",
    ]);
    // mapsUrl / mapEmbedSrc are NOT in the fail-loud set: a missing map degrades
    // gracefully, a missing address does not.
    expect(missingRequiredGlobals(resolveGlobals(branches))).toEqual([]);
  });
});

describe("🔴 D-013 · the two orderings are independent", () => {
  const branches = [
    branch({
      slug: "chikkadpally",
      name: "Chikkadpally",
      sortOrder: 1,
      phoneSortOrder: 2,
      phoneLabel: "+91 98663 76203",
      phoneE164: "+919866376203",
      whatsappE164: "+919866376203",
    }),
    branch({
      slug: "bowenpally",
      name: "Bowenpally",
      isPrimary: true,
      sortOrder: 2,
      phoneSortOrder: 1,
      phoneLabel: "+91 70751 57013",
      phoneE164: "+917075157013",
      whatsappE164: "+917075157013",
    }),
  ];

  it("phones[0] is Bowenpally — 8 occurrences across 5 UI surfaces read it", () => {
    const phones = derivePhones(branches);
    expect(phones[0]?.branch).toBe("Bowenpally");
    expect(phones[0]?.label).toBe("+91 70751 57013");
    expect(phones[0]?.href).toBe("tel:+917075157013");
  });

  it("branches[0] is Chikkadpally — layout.tsx JSON-LD telephone reads it", () => {
    expect(deriveBranches(branches)[0]?.name).toBe("Chikkadpally");
  });

  it("the two arrays are exact reverses, as in the live frontend", () => {
    const phoneOrder = derivePhones(branches).map((p) => p.branch);
    const displayOrder = deriveBranches(branches).map((b) => b.name);
    expect(phoneOrder).toEqual([...displayOrder].reverse());
  });
});

describe("🔴 X-23 · the WhatsApp href keeps its exact api.whatsapp.com form", () => {
  it("is not rebuilt as a wa.me link", () => {
    // Rebuilding this as wa.me/<digits> changes the behaviour of the floating
    // WhatsApp button, the /contact hero button and the /contact Hours card.
    expect(whatsappHref("+917075157013")).toBe(
      "https://api.whatsapp.com/send?phone=+917075157013&text=hello&lang=en",
    );
  });

  it("keeps text=hello and lang=en", () => {
    const href = whatsappHref("+917075157013");
    expect(href).toContain("&text=hello");
    expect(href).toContain("&lang=en");
    expect(href).not.toContain("wa.me");
  });
});

// ---------------------------------------------------------------------------
// Integration — against the real seeded database
// ---------------------------------------------------------------------------

describeDb("E9 · GET /api/site-settings against seeded data", () => {
  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    // Self-seeding, so the result does not depend on which suite ran first.
    // Another file truncates every table, and relying on ambient state would
    // make this pass or fail by file order rather than by behaviour.
    await seedStageS1();

    const rows = await query<{ n: string }>("SELECT count(*)::text AS n FROM branches");
    expect(rows[0]?.n).toBe("2");
  });

  it("🔴 the SEEDED primary branch really is Bowenpally with all-NULL location data", async () => {
    const branches = await loadBranches();
    const primary = branches.find((b) => b.isPrimary);

    expect(primary?.name).toBe("Bowenpally");
    // This is the whole justification for D-029, asserted against real rows.
    expect(primary?.addressFull).toBeNull();
    expect(primary?.lat).toBeNull();
    expect(primary?.lng).toBeNull();
    expect(primary?.hours).toBeNull();
    expect(primary?.mapsUrl).toBeNull();
    expect(primary?.mapEmbedSrc).toBeNull();
  });

  it("resolves all five global fields to Chikkadpally, not the primary branch", async () => {
    const payload = await buildSiteSettings();

    expect(payload.resolution.provenance.address).toBe("chikkadpally");
    expect(payload.resolution.provenance.geo).toBe("chikkadpally");
    expect(payload.resolution.provenance.hours).toBe("chikkadpally");
    expect(payload.resolution.missingRequired).toEqual([]);

    expect(payload.address?.city).toBe("Hyderabad");
    expect(payload.address?.postalCode).toBe("500020");
    expect(payload.geo?.lat).toBeCloseTo(17.405174930115965, 10);
    expect(payload.geo?.lng).toBeCloseTo(78.49652574603265, 10);
  });

  it("takes whatsapp from is_primary — the one field that legitimately does", async () => {
    const payload = await buildSiteSettings();
    expect(payload.whatsapp?.number).toBe("+917075157013"); // Bowenpally
    expect(payload.whatsapp?.href).toBe(
      "https://api.whatsapp.com/send?phone=+917075157013&text=hello&lang=en",
    );
  });

  it("returns hours in the STRUCTURED model only — never the display shape", async () => {
    const payload = await buildSiteSettings();

    expect(Array.isArray(payload.hours)).toBe(true);
    expect(payload.hours).toHaveLength(7);

    const first = payload.hours?.[0];
    expect(first).toHaveProperty("day");
    expect(first).toHaveProperty("windows");
    // D-028: producing `{days, time}` here would put the transform in two
    // places. It is the generator's job.
    expect(first).not.toHaveProperty("days");
    expect(first).not.toHaveProperty("time");
  });

  it("orders phones by phone_sort_order and branches by sort_order", async () => {
    const payload = await buildSiteSettings();
    expect(payload.phones.map((p) => p.branch)).toEqual(["Bowenpally", "Chikkadpally"]);
    expect(payload.branches.map((b) => b.name)).toEqual(["Chikkadpally", "Bowenpally"]);
  });

  it("carries the four stats with D-023 hero labels intact", async () => {
    const payload = await buildSiteSettings();
    expect(payload.stats).toHaveLength(4);

    const years = payload.stats.find((s) => s.label === "Years of expertise");
    expect(years?.heroLabel).toBe("Years practising");
    expect(years?.showInHero).toBe(true);

    // NULL hero label → the `heroLabel ?? label` fallback is genuinely used.
    const patients = payload.stats.find((s) => s.label === "Patients treated");
    expect(patients?.heroLabel).toBeNull();
    expect(patients?.showInHero).toBe(true);

    const cases = payload.stats.find((s) => s.label === "Acupuncture cases");
    expect(cases?.showInHero).toBe(false);
  });

  it("emits suffix as an empty string, not null — matching the frontend's shape", async () => {
    const payload = await buildSiteSettings();
    const therapies = payload.stats.find((s) => s.label === "Therapies offered");
    expect(therapies?.suffix).toBe("");
  });

  it("carries the three social links in order", async () => {
    const payload = await buildSiteSettings();
    expect(payload.socials.map((s) => s.name)).toEqual(["Facebook", "Instagram", "YouTube"]);
  });

  it("🔴 X-25 · reports missing brand media so the generator can fail loudly", async () => {
    const payload = await buildSiteSettings();

    // S2 has not run here, so all four are NULL — which is exactly the state
    // that would otherwise emit an empty `src` for the Header, Footer,
    // Preloader and every OG card, with a green build.
    expect(payload.logo).toBeNull();
    expect(payload.resolution.missingMedia).toEqual([
      "logo",
      "logoLockup",
      "ogImage",
      "founderPhoto",
    ]);
  });

  it("carries a REAL updatedAt, not a fabricated one", async () => {
    const payload = await buildSiteSettings();
    const stamp = new Date(payload.updatedAt).getTime();

    expect(Number.isNaN(stamp)).toBe(false);

    // This feeds sitemap.xml lastModified, replacing the frontend's current
    // meaningless `new Date()`. The property under test is that it comes from
    // the ROW — so it must be close to now, not zero and not in the far future.
    // A tolerance is required because `now()` is the database server's clock,
    // which drifts from the test process's by a few hundred milliseconds.
    const SKEW_MS = 60_000;
    expect(stamp).toBeLessThanOrEqual(Date.now() + SKEW_MS);
    expect(stamp).toBeGreaterThan(Date.now() - SKEW_MS);
  });

  it("never exposes a branch notify_email through the public payload", async () => {
    // D-020 destinations are internal routing config, not public business facts.
    const payload = await buildSiteSettings();
    expect(JSON.stringify(payload)).not.toContain("notifyEmail");
    expect(JSON.stringify(payload)).not.toContain("notify_email");
  });

  it("reflects a deactivated branch immediately", async () => {
    await withClient(async (client) => {
      await client.query("UPDATE branches SET is_active = false WHERE slug = 'bowenpally'");
    });

    try {
      const payload = await buildSiteSettings();
      expect(payload.branches.map((b) => b.name)).toEqual(["Chikkadpally"]);
      expect(payload.phones).toHaveLength(1);
      // Chikkadpally still supplies every global field, so nothing is lost.
      expect(payload.resolution.missingRequired).toEqual([]);
    } finally {
      await withClient(async (client) => {
        await client.query("UPDATE branches SET is_active = true WHERE slug = 'bowenpally'");
      });
    }
  });
});
