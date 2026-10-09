/**
 * 🔴 PRIV-01 — the privacy policy, end to end.
 *
 * Three things were wrong and all three are covered here:
 *
 *  1. `assertPrivacyReadyForLaunch()` existed and had ZERO callers, so nothing
 *     mechanically stopped an unapproved policy going live. `scripts/
 *     preflight-launch.mts` is now its caller, and the GENERATOR enforces the
 *     same rule at emission time — which is the one that actually matters,
 *     because the site is built from generated files.
 *  2. No privacy content was seeded at all.
 *  3. The draft described staff notification emails that D-038 deleted.
 *
 * The load-bearing assertions are the two states: BLOCKED while any client fact
 * is unresolved, READY once they are all supplied. A policy that misstates a
 * retention period or the registered entity is a legal exposure, so "fails
 * closed" is the only acceptable default.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { describeDb, seedStageS1, withClient } from "./helpers/db";
import { closeDb, query, queryOne } from "@/lib/db";
import {
  REQUIRED_CLIENT_INPUTS,
  UNKNOWN_MARKER,
  assertPrivacyReadyForLaunch,
  privacyReadiness,
} from "@/lib/content/privacy";
import { listContentBlocks } from "@/lib/content/public";
import { emitPageCopy } from "../generator/generate-content.mjs";
import {
  EXPECTED_PRIVACY_BLOCK_COUNT,
  EXPECTED_PRIVACY_SLOTS_WITH_MARKERS,
  PRIVACY_BLOCKS,
} from "../scripts/seed/privacy-blocks";

/**
 * The `pageCopy` object literal only — the generated file also contains JSDoc
 * that mentions the marker by name, which would otherwise match.
 */
function pageCopyLiteral(emitted: string): string {
  const start = emitted.indexOf("export const pageCopy");
  const end = emitted.indexOf("export const copyFor");
  return start >= 0 && end > start ? emitted.slice(start, end) : emitted;
}

/** Runs the real S3 stage, which seeds the privacy rows. */
async function seedStageS3(): Promise<void> {
  const { runStageS3 } = await import("../scripts/seed/stage-s3");
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await runStageS3(client);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

/** Replaces every marker, as the clinic would by editing the admin. */
async function resolveAllMarkers(): Promise<void> {
  const rows = await query<{
    id: string;
    label: string | null;
    title: string | null;
    lead: string | null;
    body: string[] | null;
    extra: Record<string, unknown> | null;
  }>(
    "SELECT id::text AS id, label, title, lead, body, extra FROM content_blocks WHERE page = 'privacy'",
  );

  const fix = (v: unknown): unknown =>
    typeof v === "string" && v.includes(UNKNOWN_MARKER) ? "A supplied value" : v;

  for (const r of rows) {
    const body = r.body === null ? null : r.body.map((p) => fix(p) as string);
    const extra =
      r.extra === null
        ? null
        : Object.fromEntries(Object.entries(r.extra).map(([k, v]) => [k, fix(v)]));

    await query(
      "UPDATE content_blocks SET label = $2, title = $3, lead = $4, body = $5, extra = $6 WHERE id = $1",
      [
        r.id,
        fix(r.label),
        fix(r.title),
        fix(r.lead),
        body === null ? null : JSON.stringify(body),
        extra === null ? null : JSON.stringify(extra),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// The content itself
// ---------------------------------------------------------------------------

describe("PRIV-01 · the seeded policy invents nothing", () => {
  it("declares the thirteen slots the page renders", () => {
    expect(PRIVACY_BLOCKS).toHaveLength(EXPECTED_PRIVACY_BLOCK_COUNT);
    const slots = PRIVACY_BLOCKS.map((b) => b.slot);
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots).toContain("intro");
    expect(slots).toContain("contact");
  });

  it("🔴 leaves every client fact as an explicit UNKNOWN marker", () => {
    const withMarker = PRIVACY_BLOCKS.filter((b) =>
      [b.label ?? "", b.title ?? "", b.lead ?? "", ...(b.body ?? []), JSON.stringify(b.extra)]
        .join("\n")
        .includes(UNKNOWN_MARKER),
    );
    expect(withMarker).toHaveLength(EXPECTED_PRIVACY_SLOTS_WITH_MARKERS);
  });

  it("🔴 states no entity name, address, registration number or jurisdiction", () => {
    const all = JSON.stringify(PRIVACY_BLOCKS);
    // Facts only the client can supply. Any of these appearing would mean a
    // legal claim had been invented.
    for (const invented of [
      "Pvt Ltd",
      "Private Limited",
      "LLP",
      "GSTIN",
      "CIN",
      "DPDP",
      "GDPR",
      "Telangana",
      "Hyderabad",
      "500020",
      "Chikkadpally",
      "Bowenpally",
    ]) {
      expect(all, `the policy must not assert "${invented}"`).not.toContain(invented);
    }
  });

  it("🔴 states no retention period, because none has been supplied", () => {
    const all = JSON.stringify(PRIVACY_BLOCKS);
    for (const period of ["months", "years", "90 days", "12 month", "6 month"]) {
      expect(all, `the policy must not assert a period ("${period}")`).not.toContain(period);
    }
  });

  it("🔴 D-038 — contains no claim that the site sends notification email", () => {
    const all = JSON.stringify(PRIVACY_BLOCKS).toLowerCase();
    // The obsolete draft wording. The site sends no email at all, so a promise
    // about what a notification "does not include" is doubly misleading.
    expect(all).not.toContain("notification sent to our staff");
    expect(all).not.toContain("notification email");
    expect(all).not.toContain("internal notification");
  });

  it("D-038 — says positively that the website sends no email", () => {
    const all = JSON.stringify(PRIVACY_BLOCKS).toLowerCase();
    expect(all).toContain("sends no email");
  });

  it("names all ten outstanding client inputs for the admin checklist", () => {
    expect(REQUIRED_CLIENT_INPUTS).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// Readiness, persistence and the two publication states
// ---------------------------------------------------------------------------

describeDb("PRIV-01 · readiness, persistence and the publication gate", () => {
  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await seedStageS1();
    await seedStageS3();
  });

  it("seeds thirteen privacy blocks into the database", async () => {
    const row = await queryOne<{ n: string }>(
      "SELECT count(*)::text AS n FROM content_blocks WHERE page = 'privacy'",
    );
    expect(Number(row?.n)).toBe(EXPECTED_PRIVACY_BLOCK_COUNT);
  });

  it("is seeded idempotently — a second S3 does not duplicate it", async () => {
    await seedStageS3();
    const row = await queryOne<{ n: string }>(
      "SELECT count(*)::text AS n FROM content_blocks WHERE page = 'privacy'",
    );
    expect(Number(row?.n)).toBe(EXPECTED_PRIVACY_BLOCK_COUNT);
  });

  it("🔴 BLOCKED on a fresh seed — the facts are outstanding", async () => {
    const readiness = await privacyReadiness();
    expect(readiness.exists).toBe(true);
    expect(readiness.publishable).toBe(false);
    expect(readiness.slotsWithMarkers).toHaveLength(EXPECTED_PRIVACY_SLOTS_WITH_MARKERS);
  });

  it("🔴 the launch guard THROWS while blocked, and names the outstanding inputs", async () => {
    await expect(assertPrivacyReadyForLaunch()).rejects.toThrow(/not ready for launch/i);
    await expect(assertPrivacyReadyForLaunch()).rejects.toThrow(/postal address/i);
  });

  it("🔴 the generator WITHHOLDS every privacy slot while blocked", async () => {
    const blocks = await listContentBlocks();
    const emitted = emitPageCopy({ contentBlocks: blocks });

    expect(emitted).toContain("export const privacyPublished = false");
    expect(emitted).not.toContain('"privacy.');
    // The marker must not reach the DATA. It legitimately appears in the
    // generated JSDoc that explains the flag, so assert on the object literal.
    expect(pageCopyLiteral(emitted)).not.toContain(UNKNOWN_MARKER);
  });

  it("🔴 the 41 derived page-copy slots are unaffected by the privacy gate", async () => {
    const blocks = await listContentBlocks();
    const emitted = emitPageCopy({ contentBlocks: blocks });
    // Withholding privacy must not withhold anything else.
    expect(emitted).toContain('"home.hero"');
    expect(emitted).toContain('"careers.apply"');
    expect(emitted).toContain('"global.ctaBand"');
  });

  it("an admin edit persists to the database and moves readiness", async () => {
    const before = await privacyReadiness();
    expect(before.slotsWithMarkers).toContain("contact");

    // Exactly what PUT /api/admin/content-blocks/privacy/contact does.
    await query(
      "UPDATE content_blocks SET body = $1 WHERE page = 'privacy' AND slot = 'contact'",
      [JSON.stringify(["Bhargavi Health World", "An address", "A number"])],
    );

    const row = await queryOne<{ body: string[] }>(
      "SELECT body FROM content_blocks WHERE page = 'privacy' AND slot = 'contact'",
    );
    expect(row?.body?.[0]).toBe("Bhargavi Health World");

    const after = await privacyReadiness();
    expect(after.slotsWithMarkers).not.toContain("contact");
    // Still blocked — seven other slots remain.
    expect(after.publishable).toBe(false);
  });

  it("🔴 READY once every fact is supplied — the guard stops throwing", async () => {
    await resolveAllMarkers();

    const readiness = await privacyReadiness();
    expect(readiness.slotsWithMarkers).toEqual([]);
    expect(readiness.publishable).toBe(true);
    await expect(assertPrivacyReadyForLaunch()).resolves.toBeUndefined();
  });

  it("🔴 and the generator then EMITS all thirteen slots", async () => {
    await resolveAllMarkers();

    const blocks = await listContentBlocks();
    const emitted = emitPageCopy({ contentBlocks: blocks });

    expect(emitted).toContain("export const privacyPublished = true");
    for (const b of PRIVACY_BLOCKS) {
      expect(emitted, `slot ${b.slot}`).toContain(`"privacy.${b.slot}"`);
    }
    expect(pageCopyLiteral(emitted)).not.toContain(UNKNOWN_MARKER);
  });

  it("withholds the WHOLE page when a single slot regresses", async () => {
    await resolveAllMarkers();
    // One fact is reverted — e.g. the client retracts a retention period.
    await query(
      "UPDATE content_blocks SET body = $1 WHERE page = 'privacy' AND slot = 'retention'",
      [JSON.stringify([UNKNOWN_MARKER])],
    );

    const blocks = await listContentBlocks();
    const emitted = emitPageCopy({ contentBlocks: blocks });

    // Not just the offending slot: publishing twelve correct sections and
    // silently dropping the retention period would read as a complete policy.
    expect(emitted).toContain("export const privacyPublished = false");
    expect(emitted).not.toContain('"privacy.intro"');
  });

  it("seeds a page_meta row for /privacy with a canonical and no invented SEO text", async () => {
    const row = await queryOne<{ canonical: string; title: string | null; description: string | null }>(
      "SELECT canonical, title, description FROM page_meta WHERE page = 'privacy'",
    );
    expect(row?.canonical).toBe("/privacy");
    // NULL on purpose: the site-wide template supplies correct wording that
    // nobody had to invent.
    expect(row?.title).toBeNull();
    expect(row?.description).toBeNull();
  });

  it("the privacy page is reachable through the normal page-copy admin API shape", async () => {
    // The policy is edited through the SAME content-blocks endpoints as every
    // other page — no bespoke privacy admin to keep in step.
    const blocks = await listContentBlocks("privacy");
    expect(blocks).toHaveLength(EXPECTED_PRIVACY_BLOCK_COUNT);
    expect(blocks.map((b) => b.slot)).toContain("intro");
  });
});
