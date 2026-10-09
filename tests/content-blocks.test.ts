/**
 * Gate 0.12 / D-037 / E15 verification.
 *
 * Three things are proved here:
 *   1. The 41-row derivation reproduces the documented distribution EXACTLY —
 *      so the row list is settled, not guessed.
 *   2. D-037's two exclusions are present and justified by the snapshot's own
 *      recorded values, not by assertion.
 *   3. Seed stage S3 inserts those 41 rows plus its 15 items, and refuses to run
 *      on a drifted derivation.
 *
 * Plus the emphasis parser, which must round-trip all ten affected headings to
 * the exact markup they render today — accepting the loss would be a visible
 * change on ten headings, which D-010 forbids.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeDb, seedStageS1, withClient } from "./helpers/db";
import { closeDb, query } from "@/lib/db";
import { listContentBlocks } from "@/lib/content/public";
import {
  EXPECTED_BLOCK_COUNT,
  EXPECTED_ITEM_COUNT_IMAGES,
  EXPECTED_ITEM_COUNT_S3,
  EXPECTED_ITEM_COUNT_TOTAL,
  EXPECTED_DISTRIBUTION,
  allowedExtraKeys,
  applyEmphasisMarkers,
  deriveContentBlockItems,
  deriveContentBlocks,
  deriveImageItems,
  validateExtra,
} from "../scripts/seed/content-blocks";
import { runStageS3 } from "../scripts/seed/stage-s3";
import { classifyCtaPair } from "../scripts/seed/code-owned-fields";
import { EXPECTED_PRIVACY_BLOCK_COUNT } from "../scripts/seed/privacy-blocks";
import { emphasise, stripEmphasis, toMarkup } from "../generator/emphasis";

const SNAPSHOT = resolve(import.meta.dirname, "..", "docs", "CURRENT-FRONTEND-CONTENT");

// ---------------------------------------------------------------------------
// 1. The derivation
// ---------------------------------------------------------------------------

describe("🔴 Gate 0.12 · the 41-row derivation", () => {
  const { blocks, excluded, problems } = deriveContentBlocks();

  it("produces NO problems — the distribution and keys both reproduce", () => {
    expect(problems).toEqual([]);
  });

  it("produces exactly 41 rows (D-036 count, D-037 list)", () => {
    expect(blocks).toHaveLength(EXPECTED_BLOCK_COUNT);
  });

  it("matches the documented per-page distribution exactly", () => {
    const actual: Record<string, number> = {};
    for (const b of blocks) actual[b.page] = (actual[b.page] ?? 0) + 1;
    expect(actual).toEqual(EXPECTED_DISTRIBUTION);
  });

  it("reproduces the slot keys the plan names by hand", () => {
    const slotsFor = (page: string) =>
      blocks
        .filter((b) => b.page === page)
        .map((b) => b.slot)
        .sort();

    // MASTER-PHASE-PLAN Phase 10 §5 names these two pages' keys explicitly, so
    // they are the only key-level check the documents permit.
    expect(slotsFor("home")).toEqual([
      "appointmentBand",
      "faqSection",
      "healthTalks",
      "hero",
      "intro",
      "testimonials",
      "therapyIndex",
      "whyUs",
    ]);
    expect(slotsFor("global")).toEqual(["ctaBand", "processSteps"]);
  });

  it("every row has a page and slot in the permitted format", () => {
    for (const b of blocks) {
      expect(b.page, `${b.page}.${b.slot}`).toMatch(/^[a-z][a-zA-Z0-9_]*$/);
      expect(b.slot, `${b.page}.${b.slot}`).toMatch(/^[a-z][a-zA-Z0-9_]*$/);
    }
  });

  it("no row is a duplicate (page, slot)", () => {
    const keys = blocks.map((b) => `${b.page}.${b.slot}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * 🔴 Was "every CTA is a complete pair". PUB-02 field-level ownership makes a
   * half supplied by CODE legitimate — `about.story` and `home.testimonials`
   * each have a derived label and an editable href. The dead-button rule is
   * unchanged and still asserted: a stored label always needs a destination.
   */
  it("every CTA is complete once code-owned halves are resolved", () => {
    for (const b of blocks) {
      for (const [labelField, hrefField] of [
        ["ctaLabel", "ctaHref"],
        ["cta2Label", "cta2Href"],
      ] as const) {
        const { problem } = classifyCtaPair({
          page: b.page,
          slot: b.slot,
          labelField,
          hrefField,
          label: b[labelField],
          href: b[hrefField],
        });
        expect(problem, `${b.page}.${b.slot}.${labelField}`).toBeNull();
      }
    }
  });

  it("🔴 a stored label still REQUIRES a destination — the dead-button rule", () => {
    for (const b of blocks) {
      if (b.ctaLabel !== null) expect(b.ctaHref, `${b.page}.${b.slot}`).not.toBeNull();
      if (b.cta2Label !== null) expect(b.cta2Href, `${b.page}.${b.slot}`).not.toBeNull();
    }
  });

  it("the two SPLIT CTAs keep their editable href and store no derived label", () => {
    for (const [page, slot, href] of [
      ["about", "story", "/contact"],
      ["home", "testimonials", "/testimonials"],
    ] as const) {
      const b = blocks.find((x) => x.page === page && x.slot === slot);
      expect(b?.ctaLabel, `${page}.${slot} label must not be stored`).toBeNull();
      expect(b?.ctaHref, `${page}.${slot} href is editable copy`).toBe(href);
    }
  });

  it("every `extra` key is on its slot's allowlist", () => {
    for (const b of blocks) {
      expect(validateExtra(b.page, b.slot, b.extra), `${b.page}.${b.slot}`).toEqual([]);
    }
  });

  it("rejects an unknown extra key rather than storing it", () => {
    // 🔴 `supportingCopy` is code-owned, so the allowlist no longer permits it:
    // storing one would be a dead admin field whose edits never render.
    expect(validateExtra("home", "hero", { supportingCopy: "ok" })).toHaveLength(1);
    expect(validateExtra("home", "hero", { somethingElse: "x" })).toHaveLength(1);
    // A slot that still has real extra copy keeps accepting it.
    expect(validateExtra("careers", "apply", { callLabel: "Prefer to call?" })).toEqual([]);
    expect(validateExtra("careers", "apply", { resumeInstruction: "x" })).toHaveLength(1);
  });

  it("records a reason for every exclusion", () => {
    expect(excluded.length).toBeGreaterThan(0);
    for (const e of excluded) {
      expect(e.why, `${e.page}.${e.slot}`).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. D-037's two exclusions, justified from the snapshot
// ---------------------------------------------------------------------------

describe("✅ D-037 · the two slots that closed gate 0.12", () => {
  const { blocks, excluded } = deriveContentBlocks();
  const snapshot = JSON.parse(
    readFileSync(resolve(SNAPSHOT, "data", "page-content.json"), "utf8"),
  ) as Record<string, { slots?: Record<string, unknown> }>;

  it("careers.mailtoSubject is NOT a content block", () => {
    expect(blocks.some((b) => b.slot === "mailtoSubject")).toBe(false);
    const entry = excluded.find((e) => e.slot === "mailtoSubject");
    expect(entry?.why).toMatch(/code-owned/);
  });

  it("…and the snapshot shows why: it is a URL-encoded mailto parameter", () => {
    // The evidence D-037 rests on, asserted rather than quoted in prose.
    const jsx = snapshot.careers?.slots?.mailtoSubjectJsx;
    expect(typeof jsx).toBe("string");
    expect(jsx as string).toContain("mailto:");
    expect(jsx as string).toContain("encodeURIComponent");
  });

  it("serviceDetail.heroImageAlt is NOT a content block", () => {
    expect(blocks.some((b) => b.slot === "heroImageAlt")).toBe(false);
    const entry = excluded.find((e) => e.slot === "heroImageAlt");
    expect(entry?.why).toMatch(/derived/);
  });

  it("…and the snapshot shows why: it is a template with no authored value", () => {
    // The recorded value is a PLACEHOLDER, which is the proof that there is no
    // distinct alt text to preserve.
    expect(snapshot.serviceDetail?.slots?.heroImageAlt).toBe(
      "<service.title> at Bhargavi Health World",
    );
    expect(snapshot.serviceDetail?.slots?.heroImageAltJsx).toBe(
      "`${service.title} at ${site.name}`",
    );
  });

  it("neither slot appears on any extra allowlist", () => {
    expect(allowedExtraKeys("careers", "apply")).not.toContain("mailtoSubject");
    expect(allowedExtraKeys("serviceDetail", "heroImageAlt")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. The emphasis convention (B6)
// ---------------------------------------------------------------------------

describe("✅ D-037 / B6 · the *marker* emphasis convention", () => {
  /** The ten headings, verified in live source — MASTER-PHASE-PLAN Phase 10 §5. */
  const TEN_HEADINGS: Array<[string, string]> = [
    ["Hero.tsx:50", "for *you*"],
    ["HomeSections.tsx:75", "Healing that treats the *whole* person"],
    ["services/page.tsx:29", "one *whole-person* approach"],
    ["about/page.tsx:59", "*Anjana*"],
    ["contact/page.tsx:101", "a *consultation*"],
    ["gallery/page.tsx:28", "*around*"],
    ["videos/page.tsx:33", "*talks*"],
    ["testimonials/page.tsx:25", "their *own* words"],
    ["blog/page.tsx:30", "on *natural* healing"],
    ["careers/page.tsx:43", "*Bhargavi*"],
  ];

  for (const [where, marked] of TEN_HEADINGS) {
    it(`round-trips ${where} to the exact markup it renders today`, () => {
      const markup = toMarkup(marked);
      expect(markup).toContain('<span className="italic">');
      // Exactly one span — the convention emits one element type and no more.
      expect(markup.match(/<span className="italic">/g)).toHaveLength(1);
      // And stripping the markers yields the plain reading, with no asterisks.
      expect(stripEmphasis(marked)).not.toContain("*");
    });
  }

  it("emits React elements, never raw HTML — so a script tag is inert", () => {
    const nodes = emphasise('Totally *safe* <script>alert(1)</script>');

    // The script tag survives as a literal STRING, which React escapes. If this
    // returned markup, it would be a second XSS path alongside blog blocks.
    const strings = nodes.filter((n): n is string => typeof n === "string");
    expect(strings.join("")).toContain("<script>");
    expect(nodes.some((n) => typeof n === "object")).toBe(true);
  });

  it("leaves an unmatched asterisk as literal text", () => {
    expect(emphasise("5 * 3 = 15")).toEqual(["5 * 3 = 15"]);
    expect(stripEmphasis("a lone * asterisk")).toBe("a lone * asterisk");
  });

  it("never spans a newline", () => {
    const nodes = emphasise("first *line\nsecond* line");
    expect(nodes.every((n) => typeof n === "string")).toBe(true);
  });

  it("recovers a marker from the snapshot's sibling *Jsx annotation", () => {
    expect(
      applyEmphasisMarkers(
        "Healing that treats the whole person",
        'Healing that treats the <span className="italic">whole</span> person',
      ),
    ).toBe("Healing that treats the *whole* person");
  });

  it("leaves a heading untouched when there is no emphasis to recover", () => {
    expect(applyEmphasisMarkers("A plain heading", undefined)).toBe("A plain heading");
    expect(applyEmphasisMarkers("A plain heading", "A plain heading")).toBe("A plain heading");
  });
});

// ---------------------------------------------------------------------------
// 4. The items
// ---------------------------------------------------------------------------

describe("D-024 · content_block_items", () => {
  const { items, problems } = deriveContentBlockItems();
  const { images, problems: imageProblems } = deriveImageItems();

  it("derives 14 non-image rows", () => {
    expect(problems).toEqual([]);
    expect(items).toHaveLength(EXPECTED_ITEM_COUNT_S3);
    expect(EXPECTED_ITEM_COUNT_S3).toBe(14);
  });

  it("✅ Q-013 · derives 3 D-027 image rows — the three D-027 enumerates", () => {
    expect(imageProblems).toEqual([]);
    expect(images).toHaveLength(EXPECTED_ITEM_COUNT_IMAGES);
    expect(EXPECTED_ITEM_COUNT_IMAGES).toBe(3);

    // D-027 names them by file and line. The founder portrait is not among them.
    expect(images.map((i) => i.imagePath).sort()).toEqual([
      "/images/services/accupressure.jpg",
      "/images/services/acupuncture.jpg",
      "/images/services/seed-therapy.jpg",
    ]);
  });

  it("🔴 Q-013 · the founder portrait is NOT a row — it is derived", () => {
    // Its src is `site.founder.photo` and its alt is
    // `${honorific} ${name}, ${role}`, which the snapshot records in `altJsx`.
    // Storing either would freeze a copy that stops tracking site_settings.
    expect(images.some((i) => i.imagePath.includes("anjana-bhargavi"))).toBe(false);
    expect(images.some((i) => i.label === "portrait")).toBe(false);

    // …and the one hero row that DOES exist is the wide treatment image.
    const hero = images.filter((i) => i.slot === "hero");
    expect(hero).toHaveLength(1);
    expect(hero[0]?.label).toBe("wide treatment image");
  });

  it("…and the arithmetic now agrees with D-027: 14 + 3 = 17", () => {
    // The earlier pass read D-027's "three" as a miscount and kept 18. But
    // D-027 ENUMERATES three images, its Mapping row says hero gets 1 row, and
    // D-036's own prose says "the three D-027 image rows" — so 18 was the slip.
    expect(EXPECTED_ITEM_COUNT_S3 + EXPECTED_ITEM_COUNT_IMAGES).toBe(
      EXPECTED_ITEM_COUNT_TOTAL,
    );
    expect(EXPECTED_ITEM_COUNT_TOTAL).toBe(17);
  });

  it("🔴 reads every image's alt text from the snapshot, never invents one", () => {
    for (const image of images) {
      expect(image.alt, `${image.slot}[${String(image.sortOrder)}]`).toBeTruthy();
      expect(image.imagePath).toMatch(/^\/images\//);
    }

    // The exact authored alt from the snapshot, asserted so a future refactor
    // cannot quietly substitute a templated string. The hero's wide treatment
    // image is the one that survives Q-013, and its alt is genuinely authored —
    // it mentions the clinic by name and describes the photograph.
    const heroWide = images.find((i) => i.slot === "hero");
    expect(heroWide?.alt).toBe(
      "Acupuncture needles placed along a patient's back at Bhargavi Health World",
    );
    expect(heroWide?.imagePath).toBe("/images/services/acupuncture.jpg");
  });

  it("carries the `role` label the layout distinguishes by", () => {
    // ✅ Q-013 — one hero row now, so "portrait" is gone. The label is kept
    // because `home.intro`'s pair is still ordered, and because losing it would
    // make the surviving row indistinguishable from an intro row.
    const hero = images.filter((i) => i.slot === "hero");
    expect(hero.map((i) => i.label)).toEqual(["wide treatment image"]);
  });

  it("stores LABELS only for the two derived-value groups", () => {
    // appointmentBand.rows reads site.phones[0], site.whatsapp.href and
    // site.address.full; contact.infoCards.lines likewise. Storing those values
    // would create a second home for the clinic's phone number.
    for (const i of items.filter((x) => x.slot === "appointmentBand")) {
      expect(i.value, `${i.slot}[${String(i.sortOrder)}]`).toBeNull();
      expect(i.lines, `${i.slot}[${String(i.sortOrder)}]`).toBeNull();
      expect(i.label).toBeTruthy();
    }

    for (const i of items.filter((x) => x.slot === "infoCards")) {
      // `lines` and `href` are derived from settings and stay NULL; the CTA's
      // own label IS authored copy, so it is stored.
      expect(i.lines, `${i.slot}[${String(i.sortOrder)}]`).toBeNull();
      expect(i.href, `${i.slot}[${String(i.sortOrder)}]`).toBeNull();
      expect(i.label).toBeTruthy();
      expect(i.value).toBeTruthy();
    }
  });

  it("stores only the three metaRow labels, values coming from the service", () => {
    const metaRow = items.filter((i) => i.slot === "metaRow");
    expect(metaRow).toHaveLength(3);
    for (const i of metaRow) {
      expect(i.label).toBeTruthy();
      expect(i.value).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Seed stage S3 against the real database
// ---------------------------------------------------------------------------

describeDb("E15 · seed stage S3", () => {
  beforeAll(async () => {
    await seedStageS1();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("inserts 41 derived + 13 privacy content_blocks, and 15 items", async () => {
    const counts = await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const result = await runStageS3(client);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    // 54 = the 41 DERIVED rows plus the 13 PRIVACY rows (E17). The derived set
    // is still asserted exactly, by `runStageS3` itself and by the test above.
    expect(counts.content_blocks).toBe(41 + EXPECTED_PRIVACY_BLOCK_COUNT);
    // 15 here; S2's three D-027 image rows bring the total to 18.
    expect(counts.content_block_items).toBe(EXPECTED_ITEM_COUNT_S3);
  });

  it("is idempotent — a re-run produces no duplicates", async () => {
    await withClient(async (client) => {
      await client.query("BEGIN");
      await runStageS3(client);
      await client.query("COMMIT");
    });

    const rows = await query<{ n: string }>("SELECT count(*)::text AS n FROM content_blocks");
    expect(rows[0]?.n).toBe(String(41 + EXPECTED_PRIVACY_BLOCK_COUNT));

    // The DERIVED set specifically is still exactly 41 — the privacy rows are
    // additive and must never displace one.
    const derived = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM content_blocks WHERE page <> 'privacy'",
    );
    expect(derived[0]?.n).toBe("41");
  });

  it("serves the blocks through the public endpoint with their items grouped", async () => {
    const blocks = await listContentBlocks();
    expect(blocks).toHaveLength(41 + EXPECTED_PRIVACY_BLOCK_COUNT);
    expect(blocks.filter((b) => b.page !== "privacy")).toHaveLength(41);

    const band = blocks.find((b) => b.page === "home" && b.slot === "appointmentBand");
    expect(band?.items).toHaveLength(3);
    expect(band?.items.every((i) => i.groupKey === "rows")).toBe(true);

    const hero = blocks.find((b) => b.page === "home" && b.slot === "hero");
    // 🔴 `supportingCopy` was this slot's only `extra` key and is now
    // code-owned (PUB-02) — the live hero interpolates the founder's name into
    // it — so `home.hero` carries no `extra` at all.
    expect(hero?.extra).toBeNull();
  });

  it("filters by page", async () => {
    const careers = await listContentBlocks("careers");
    expect(careers).toHaveLength(4);
    expect(careers.every((b) => b.page === "careers")).toBe(true);
  });

  it("the database rejects an extra that is not an object", async () => {
    await expect(
      query(
        `INSERT INTO content_blocks (page, slot, extra) VALUES ('home','bad','["not an object"]'::jsonb)`,
      ),
    ).rejects.toThrow();
  });

  it("the database rejects a CTA label with no href", async () => {
    await expect(
      query("INSERT INTO content_blocks (page, slot, cta_label) VALUES ('home','bad2','Click')"),
    ).rejects.toThrow();
  });
});
