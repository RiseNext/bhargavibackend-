/**
 * E10 / 7.5 verification gate — the content generator.
 *
 * Ranked risk 2 of the whole project: nine emission rules, three of which cause
 * a build failure and two a silent content loss. The two load-bearing proofs
 * here are:
 *
 *   · the **golden hours test** (D-028) — byte-identical, EN DASH compared by
 *     code point, because getting this wrong is a TypeScript build failure plus
 *     wrong copy on three live surfaces;
 *   · **deep-equality** of the generated exports against the immutable snapshot,
 *     with every intended difference declared.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeDb, seedStageS1, withClient } from "./helpers/db";
import { closeDb, query } from "@/lib/db";
import { buildSiteSettings } from "@/lib/settings/site-settings";
import {
  listContentBlocks,
  listContentLists,
  listFaqs,
  listGallery,
  listJobs,
  listPosts,
  listServices,
  listTestimonials,
  listVideos,
  listPageMeta,
} from "@/lib/content/public";

import {
  DASH,
  formatTime,
  labelDays,
  toDisplayHours,
  toStructuredExport,
  validateStructuredHours,
} from "../generator/hours.mjs";
import {
  assertUsable,
  formatRupees,
  generateAll,
} from "../generator/generate-content.mjs";
import { extractExport, verifyExport, formatReport } from "../generator/verify-generated.mjs";

const SNAPSHOT = resolve(import.meta.dirname, "..", "docs", "CURRENT-FRONTEND-CONTENT");

const readSnapshot = <T>(file: string): T =>
  JSON.parse(readFileSync(resolve(SNAPSHOT, "data", file), "utf8")) as T;

// ---------------------------------------------------------------------------
// 🔴 D-028 — the golden hours test
// ---------------------------------------------------------------------------

describe("🔴 D-028 · the hours transform", () => {
  const MON_SUN_9_TO_9 = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    windows: [{ open: "09:00", close: "21:00" }],
  }));

  it("GOLDEN · produces byte-identical output for the seeded hours", () => {
    const result = toDisplayHours(MON_SUN_9_TO_9);

    // The exact live value from src/lib/site.ts:64-66.
    expect(result).toEqual([{ days: "Monday – Sunday", time: "9:00 AM – 9:00 PM" }]);
  });

  it("GOLDEN · the separator is U+2013 EN DASH, compared by code point", () => {
    const [entry] = toDisplayHours(MON_SUN_9_TO_9);

    // A HYPHEN-MINUS or an EM DASH here would be a visible change on three
    // surfaces, and would look identical in a failing diff — hence comparing
    // code points rather than the rendered string.
    const EN_DASH = String.fromCodePoint(0x2013);
    expect(DASH).toBe(EN_DASH);
    expect(entry?.days).toBe(`Monday ${EN_DASH} Sunday`);
    expect(entry?.time).toBe(`9:00 AM ${EN_DASH} 9:00 PM`);

    // And no HYPHEN-MINUS or EM DASH anywhere in either field.
    for (const field of [entry?.days ?? "", entry?.time ?? ""]) {
      const points = [...field].map((c) => c.codePointAt(0));
      expect(points).toContain(0x2013);
      expect(points).not.toContain(0x002d); // HYPHEN-MINUS
      expect(points).not.toContain(0x2014); // EM DASH
      expect(points).not.toContain(0x202f); // NARROW NO-BREAK SPACE (ICU artefact)
    }

    // Single ASCII spaces either side, not a narrow no-break space.
    expect(entry?.days).toContain(` ${DASH} `);
    expect(entry?.time).toContain(` ${DASH} `);
  });

  it("GOLDEN · matches the snapshot's own recorded value", () => {
    const snapshot = readSnapshot<{ site: { hours: Array<{ days: string; time: string }> } }>(
      "site-settings.json",
    );
    expect(toDisplayHours(MON_SUN_9_TO_9)).toEqual(snapshot.site.hours);
  });

  it("formats times with a hand-rolled formatter, not Intl", () => {
    // Intl output varies by ICU version — lowercase meridiem on some builds,
    // U+202F before the meridiem on newer ones. Either would change live copy
    // depending on which machine ran the build.
    expect(formatTime("09:00")).toBe("9:00 AM");
    expect(formatTime("21:00")).toBe("9:00 PM");
    expect(formatTime("00:00")).toBe("12:00 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("12:30")).toBe("12:30 PM");
    expect(formatTime("13:05")).toBe("1:05 PM");
    expect(formatTime("23:59")).toBe("11:59 PM");

    // No leading zero on the hour, two digits on the minute, ASCII space.
    expect(formatTime("09:05")).toBe("9:05 AM");
    expect(formatTime("09:00")).not.toContain(" ");
  });

  it("groups consecutive days and omits closed ones entirely", () => {
    // Mon–Sat open, Sunday closed. The legacy shape has no "closed" concept, and
    // emitting "Sunday Closed" would add visible text (D-010).
    const hours = [1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      windows: [{ open: "10:00", close: "19:00" }],
    }));
    hours.push({ day: 0, windows: [] });

    expect(toDisplayHours(hours)).toEqual([
      { days: "Monday – Saturday", time: "10:00 AM – 7:00 PM" },
    ]);
  });

  it("labels a single open day without a range", () => {
    expect(
      toDisplayHours([
        { day: 1, windows: [{ open: "09:00", close: "13:00" }] },
        { day: 2, windows: [] },
      ]),
    ).toEqual([{ days: "Monday", time: "9:00 AM – 1:00 PM" }]);

    expect(labelDays([1])).toBe("Monday");
    expect(labelDays([1, 2, 3])).toBe("Monday – Wednesday");
  });

  it("joins a split shift within one entry with ', '", () => {
    // careers/page.tsx:112 reads hours[0] directly, so the whole day must be in
    // one entry rather than split across two.
    const hours = [1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      windows: [
        { open: "10:00", close: "13:30" },
        { open: "16:00", close: "19:30" },
      ],
    }));
    hours.push({ day: 0, windows: [] });

    expect(toDisplayHours(hours)).toEqual([
      {
        days: "Monday – Saturday",
        time: "10:00 AM – 1:30 PM, 4:00 PM – 7:30 PM",
      },
    ]);
  });

  it("splits a run when the middle day differs", () => {
    const hours = [
      { day: 1, windows: [{ open: "09:00", close: "21:00" }] },
      { day: 2, windows: [{ open: "09:00", close: "21:00" }] },
      { day: 3, windows: [{ open: "09:00", close: "13:00" }] },
      { day: 4, windows: [{ open: "09:00", close: "21:00" }] },
      { day: 5, windows: [{ open: "09:00", close: "21:00" }] },
      { day: 6, windows: [] },
      { day: 0, windows: [] },
    ];

    expect(toDisplayHours(hours)).toEqual([
      { days: "Monday – Tuesday", time: "9:00 AM – 9:00 PM" },
      { days: "Wednesday", time: "9:00 AM – 1:00 PM" },
      { days: "Thursday – Friday", time: "9:00 AM – 9:00 PM" },
    ]);
  });

  it("orders Monday-first, so Sunday never leads", () => {
    // Input deliberately in getDay() order (Sunday first) to prove the
    // transform reorders rather than trusting the input order.
    const hours = [
      { day: 0, windows: [{ open: "11:00", close: "15:00" }] },
      { day: 1, windows: [{ open: "09:00", close: "21:00" }] },
    ];

    const result = toDisplayHours(hours);
    expect(result[0]?.days).toBe("Monday");
    expect(result[1]?.days).toBe("Sunday");
  });

  it("rejects an invalid structured model rather than emitting nonsense", () => {
    expect(validateStructuredHours([{ day: 9, windows: [] }]).length).toBeGreaterThan(0);
    expect(
      validateStructuredHours([
        { day: 1, windows: [{ open: "21:00", close: "09:00" }] },
      ]),
    ).toContainEqual(expect.stringContaining("does not advance"));
    expect(
      validateStructuredHours([
        {
          day: 1,
          windows: [
            { open: "10:00", close: "19:00" },
            { open: "16:00", close: "20:00" },
          ],
        },
      ]),
    ).toContainEqual(expect.stringContaining("overlap"));
    expect(
      validateStructuredHours([
        { day: 1, windows: [] },
        { day: 1, windows: [] },
      ]),
    ).toContainEqual(expect.stringContaining("more than once"));
  });

  it("🔴 FAILS rather than returning an empty array when every day is closed", () => {
    // All three legacy consumers read site.hours, and careers reads hours[0].
    // An empty array is a TypeScript-clean build with broken copy.
    expect(() => toDisplayHours([{ day: 1, windows: [] }])).not.toThrow();
    expect(toDisplayHours([{ day: 1, windows: [] }])).toEqual([]);
    // assertDisplayHoursUsable is what converts that into a build failure; the
    // emitter path is covered in the emission tests below.
  });

  it("normalises day names as well as indexes", () => {
    expect(
      toDisplayHours([
        { day: "monday", windows: [{ open: "09:00", close: "21:00" }] },
      ]),
    ).toEqual([{ days: "Monday", time: "9:00 AM – 9:00 PM" }]);
  });

  it("emits hoursStructured in Monday-first order, additively", () => {
    const structured = toStructuredExport(MON_SUN_9_TO_9);
    expect(structured.map((d: { day: number }) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe("price formatting", () => {
  it("renders ₹100 exactly as the hardcoded JSX did", () => {
    expect(formatRupees(10_000)).toBe("From ₹100");
  });

  it("keeps paise where they exist rather than rounding silently", () => {
    expect(formatRupees(10_050)).toBe("From ₹100.50");
  });
});

// ---------------------------------------------------------------------------
// Integration — generate from the real database, then prove equality
// ---------------------------------------------------------------------------

/**
 * Inserts media rows and backfills the FKs that stage S2 would.
 *
 * Cloudinary credentials are unavailable, so S2 cannot run — but the generator
 * must be verifiable now. These rows are shaped exactly as S2 produces them,
 * with Cloudinary-form URLs, so what is exercised is the generator and not the
 * provider.
 */
/** Runs the REAL stage S3, so the 41 page-copy rows exist (D-037). */
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

async function simulateStageS2(): Promise<void> {
  const { assetInventory } = await import("../scripts/seed/assets");
  const { mediaId } = await import("../scripts/seed/ids");
  const { serviceId, contentListId, galleryId } = await import("../scripts/seed/ids");
  const { gallerySeeds, serviceSeeds, siteSnapshot, contentFileExports } = await import(
    "../scripts/seed/snapshot"
  );

  const assets = assetInventory();

  for (const [index, asset] of assets.entries()) {
    const publicId = `bhw/${asset.folder}/test-${String(index).padStart(2, "0")}`;
    await query(
      `INSERT INTO media (id, provider, public_id, resource_type, delivery_type, visibility,
                          format, bytes, width, height, secure_url, version, etag,
                          original_filename, alt_default, folder)
       VALUES ($1,'cloudinary',$2,'image','upload','public','jpg',123456,1200,800,$3,'v1','etag',$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [
        mediaId(asset.publicPath),
        publicId,
        // 🔴 NOT the `demo` cloud. `assertUsable` now refuses any media URL on
        // Cloudinary's public sample cloud, because a build generated from
        // `seed:local-full` emitted 25 such URLs and shipped 125 broken images.
        // This fixture is about the EMISSION contract, so it uses a
        // realistic-looking account name and leaves that guard to its own test.
        `https://res.cloudinary.com/bhw-test-cloud/image/upload/v1/${publicId}.jpg`,
        asset.publicPath.split("/").pop(),
        asset.altDefault,
        asset.folder,
      ],
    );
  }

  for (const s of serviceSeeds()) {
    await query("UPDATE services SET image_media_id = $2 WHERE id = $1", [
      serviceId(s.slug),
      mediaId(s.imagePath),
    ]);
  }

  for (const [i, w] of contentFileExports().whyChooseUs.entries()) {
    await query("UPDATE content_list_items SET icon_media_id = $2 WHERE id = $1", [
      contentListId("why_choose_us", i + 1),
      mediaId(w.icon),
    ]);
  }

  for (const g of gallerySeeds()) {
    await query(
      `INSERT INTO gallery_images (id, media_id, alt, sort_order, published)
       VALUES ($1,$2,$3,$4,true) ON CONFLICT (id) DO NOTHING`,
      [galleryId(g.sortOrder), mediaId(g.imagePath), g.alt, g.sortOrder],
    );
  }

  const site = siteSnapshot();
  await query(
    `UPDATE site_settings SET logo_media_id = $1, logo_lockup_media_id = $2,
            og_media_id = $3, founder_photo_media_id = $4 WHERE id = 1`,
    [
      mediaId(site.logo),
      mediaId(site.logoLockup),
      mediaId(site.ogImage),
      mediaId(site.founder.photo),
    ],
  );
}

/** Builds the generator's input straight from the repositories. */
async function loadContent() {
  return {
    settings: await buildSiteSettings(),
    services: await listServices(),
    testimonials: await listTestimonials(),
    videos: await listVideos(),
    gallery: await listGallery(),
    faqs: await listFaqs(),
    jobs: await listJobs(),
    contentLists: await listContentLists(),
    // 🔴 Was absent, so `emitPageCopy` and the 41 page-copy rows were never
    // exercised by this suite at all — which is how GEN-SEO-03's missing
    // content-blocks validation went unnoticed.
    contentBlocks: await listContentBlocks(),
    pageMeta: await listPageMeta(),
    posts: (await listPosts({ page: 1, limit: 50 })).items,
  };
}

describeDb("E10 · generator against real data", () => {
  let content: Awaited<ReturnType<typeof loadContent>>;
  let files: Record<string, string>;

  beforeAll(async () => {
    await seedStageS1();
    await simulateStageS2();
    // 🔴 S3 supplies the 41 `content_blocks` rows. It was absent, so this
    // suite generated with EMPTY page copy and never noticed — which is how
    // GEN-SEO-03's missing content-blocks validation survived. The generator
    // now refuses an empty `content_blocks`, so the fixture must be complete.
    await seedStageS3();
    content = await loadContent();
    files = generateAll(content) as Record<string, string>;
  });

  afterAll(async () => {
    await closeDb();
  });

  it("emits every module the frontend imports", () => {
    expect(Object.keys(files).sort()).toEqual([
      "src/content/careers.ts",
      "src/content/media.ts",
      // ✅ D-037 / E15 — the 41 content_blocks rows.
      "src/content/page-copy.ts",
      "src/content/page-meta.ts",
      "src/content/posts.ts",
      "src/content/services.ts",
      "src/content/site-content.ts",
      "src/content/testimonials.ts",
      "src/lib/site.ts",
    ]);
  });

  it("✅ D-037 · emits the mailto subject as code-owned, not CMS content", () => {
    const source = files["src/content/careers.ts"] ?? "";
    expect(source).toContain("export const mailtoSubject");
    expect(source).toContain("Job application — Bhargavi Health World");
    expect(source).toMatch(/CODE-OWNED chrome/);
  });

  it("✅ D-037 · emits the service hero alt as a DERIVED helper, not a field", () => {
    const source = files["src/content/services.ts"] ?? "";
    expect(source).toContain("export const serviceHeroAlt");
    // The exact template services/[slug]/page.tsx:112 renders today.
    expect(source).toContain("at ${");
    // And no alt is stored on the service rows themselves.
    expect(source).not.toContain("heroImageAlt:");
  });

  it("marks every generated file as generated", () => {
    for (const [name, source] of Object.entries(files)) {
      expect(source, name).toContain("GENERATED FILE — DO NOT EDIT BY HAND");
    }
  });

  // -- site.ts ------------------------------------------------------------

  it("🔴 R-b · emits `site` with `as const`", () => {
    expect(files["src/lib/site.ts"]).toMatch(/export const site = \{[\s\S]*\} as const;/);
  });

  it("🔴 R-f / D-026 · re-emits nav, NavItem and NavChild verbatim", () => {
    const source = files["src/lib/site.ts"] ?? "";

    // Header.tsx:8 imports all three. Losing any is a dead deployment.
    expect(source).toContain("export type NavChild");
    expect(source).toContain("export type NavItem");
    expect(source).toContain("export const nav: NavItem[]");

    const nav = extractExport(source, "nav") as Array<{ label: string; href: string }>;
    const snapshot = readSnapshot<{ navigationSource: typeof nav }>("site-settings.json");
    expect(nav).toEqual(snapshot.navigationSource);
  });

  it("🔴 keeps site.url as an env-overridable EXPRESSION, not a baked literal", () => {
    const source = files["src/lib/site.ts"] ?? "";
    expect(source).toContain(
      'url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.bhargavihealthworld.com"',
    );
  });

  it("🔴 D-028 · emits the legacy hours shape AND hoursStructured", () => {
    const source = files["src/lib/site.ts"] ?? "";
    const site = extractExport(source, "site") as {
      hours: Array<{ days: string; time: string }>;
    };

    expect(site.hours).toEqual([{ days: "Monday – Sunday", time: "9:00 AM – 9:00 PM" }]);

    // Additive, so OpenStatus and the JSON-LD builder can stop duplicating it.
    expect(source).toContain("export const hoursStructured");
    const structured = extractExport(source, "hoursStructured") as Array<{ day: number }>;
    expect(structured.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("🔴 X-23 · re-emits the api.whatsapp.com href exactly", () => {
    const site = extractExport(files["src/lib/site.ts"] ?? "", "site") as {
      whatsapp: { href: string };
    };
    expect(site.whatsapp.href).toBe(
      "https://api.whatsapp.com/send?phone=+917075157013&text=hello&lang=en",
    );
    expect(site.whatsapp.href).not.toContain("wa.me");
  });

  it("🔴 D-013 · phones[0] is Bowenpally and branches[0] is Chikkadpally", () => {
    const site = extractExport(files["src/lib/site.ts"] ?? "", "site") as {
      phones: Array<{ branch: string; label: string }>;
      branches: Array<{ name: string }>;
    };

    expect(site.phones[0]?.branch).toBe("Bowenpally");
    expect(site.branches[0]?.name).toBe("Chikkadpally");
  });

  it("DEEP-EQUALITY · site matches the snapshot except for intended differences", () => {
    const snapshot = readSnapshot<{ site: Record<string, unknown> }>("site-settings.json");

    // The snapshot carries two annotation keys that were never part of `site`.
    const expected = { ...snapshot.site };
    delete expected._urlIsEnvOverridable;

    const result = verifyExport({
      generatedSource: files["src/lib/site.ts"] ?? "",
      exportName: "site",
      snapshotValue: expected,
    });

    expect(result.ok, formatReport("site", result)).toBe(true);
    // Proof the exemptions are the media URLs and nothing more.
    expect(result.expected.map((d: { path: string }) => d.path).sort()).toEqual([
      "founder.photo",
      "logo",
      "logoLockup",
      "ogImage",
    ]);
  });

  // -- collections --------------------------------------------------------

  it("DEEP-EQUALITY · services match the snapshot", () => {
    const snapshot = readSnapshot<{ services: unknown[] }>("services.json");
    const result = verifyExport({
      generatedSource: files["src/content/services.ts"] ?? "",
      exportName: "services",
      snapshotValue: snapshot.services,
    });

    expect(result.ok, formatReport("services", result)).toBe(true);

    // Exactly 10 services × (copyStatus dropped + image migrated + two new
    // fields + updatedAt). Asserting the SHAPE of the difference, not just its
    // absence: `updatedAt` joined the list for SEO-01, so that sitemap.xml can
    // stamp a real per-service lastModified instead of the build time.
    const paths = new Set(result.expected.map((d: { path: string }) => d.path.split(".").pop()));
    expect([...paths].sort()).toEqual([
      "copyStatus", "image", "priceFrom", "typicalCourse", "updatedAt",
    ]);
  });

  it("DEEP-EQUALITY · testimonials match the snapshot exactly", () => {
    const snapshot = readSnapshot<{ testimonials: unknown[] }>("testimonials.json");
    const result = verifyExport({
      generatedSource: files["src/content/testimonials.ts"] ?? "",
      exportName: "testimonials",
      snapshotValue: snapshot.testimonials,
    });

    // No exemptions at all here — testimonials carry no media and no new field.
    expect(result.ok, formatReport("testimonials", result)).toBe(true);
    expect(result.expected).toHaveLength(0);
  });

  it("DEEP-EQUALITY · videos match the snapshot exactly", () => {
    const snapshot = readSnapshot<{ videos: unknown[] }>("videos.json");
    const result = verifyExport({
      generatedSource: files["src/content/media.ts"] ?? "",
      exportName: "videos",
      snapshotValue: snapshot.videos,
    });

    expect(result.ok, formatReport("videos", result)).toBe(true);
    expect(result.expected).toHaveLength(0);
  });

  it("DEEP-EQUALITY · jobs match the snapshot exactly", () => {
    const snapshot = readSnapshot<{ jobs: unknown[] }>("jobs.json");
    const result = verifyExport({
      generatedSource: files["src/content/careers.ts"] ?? "",
      exportName: "jobs",
      snapshotValue: snapshot.jobs,
    });

    // Proves the D-015 branch derivation reproduces the original strings,
    // including "Either branch".
    expect(result.ok, formatReport("jobs", result)).toBe(true);
    expect(result.expected).toHaveLength(0);
  });

  it("DEEP-EQUALITY · faqs match the snapshot exactly", () => {
    const snapshot = readSnapshot<{ faqs: unknown[] }>("faqs.json");
    const result = verifyExport({
      generatedSource: files["src/content/site-content.ts"] ?? "",
      exportName: "faqs",
      snapshotValue: snapshot.faqs,
    });

    expect(result.ok, formatReport("faqs", result)).toBe(true);
  });

  it("DEEP-EQUALITY · gallery matches the snapshot apart from migrated URLs", () => {
    const snapshot = readSnapshot<{ galleryImages: unknown[] }>("gallery.json");
    const result = verifyExport({
      generatedSource: files["src/content/media.ts"] ?? "",
      exportName: "galleryImages",
      snapshotValue: snapshot.galleryImages,
    });

    expect(result.ok, formatReport("galleryImages", result)).toBe(true);
    // Alt text must be unchanged; only `src` moves.
    expect(
      result.expected.every((d: { path: string }) => d.path.endsWith("src")),
    ).toBe(true);
  });

  it("🔴 D-023 · stats carry both labels, and the hero selection", () => {
    const stats = extractExport(files["src/content/site-content.ts"] ?? "", "stats") as Array<{
      label: string;
      heroLabel?: string;
      showInHero?: boolean;
      suffix: string;
    }>;

    const snapshot = readSnapshot<{
      statsBand: { items: Array<{ value: number; suffix: string; label: string }> };
      heroStats: { items: Array<{ k: string; v: string }> };
    }>("stats.json");

    // The band's four rows, in order, with their original labels.
    expect(stats.map((s) => s.label)).toEqual(snapshot.statsBand.items.map((i) => i.label));
    expect(stats.map((s) => s.suffix)).toEqual(snapshot.statsBand.items.map((i) => i.suffix));

    // And the hero's three, with ITS wording — the whole point of D-023.
    const hero = stats.filter((s) => s.showInHero);
    expect(hero).toHaveLength(3);
    expect(hero.map((s) => s.heroLabel ?? s.label)).toEqual(
      snapshot.heroStats.items.map((i) => i.v),
    );
  });

  it("emits the five content-list collections", () => {
    const source = files["src/content/site-content.ts"] ?? "";

    expect((extractExport(source, "whyChooseUs") as unknown[]).length).toBe(4);
    expect((extractExport(source, "process") as unknown[]).length).toBe(4);
    expect((extractExport(source, "philosophy") as unknown[]).length).toBe(3);
    expect((extractExport(source, "aboutStory") as unknown[]).length).toBe(3);
    expect((extractExport(source, "achievements") as unknown[]).length).toBe(5);
  });

  it("preserves the two prose strings awaiting their CMS home", () => {
    const source = files["src/content/site-content.ts"] ?? "";
    // D-011: the hardcoded content keeps the site working until the backend is
    // complete and verified. Both are byte-identical to the snapshot.
    expect(source).toContain("export const homeIntro");
    expect(source).toContain("export const treatmentsIntro");
    expect(source).toContain("awaiting its CMS home");
  });

  it("emits posts as an empty array when none are published", () => {
    const posts = extractExport(files["src/content/posts.ts"] ?? "", "posts");
    expect(posts).toEqual([]);
  });

  it("emits the nine page_meta rows", () => {
    const meta = extractExport(files["src/content/page-meta.ts"] ?? "", "pageMeta") as Record<
      string,
      unknown
    >;
    expect(Object.keys(meta).sort()).toEqual([
      "about",
      "blog",
      "careers",
      "contact",
      "gallery",
      "home",
      // E17 — the new privacy route. Seeded canonical-only, so its title and
      // description fall back to the site-wide template.
      "privacy",
      "services",
      "testimonials",
      "videos",
    ]);
  });

  // -- R-i · fail the build ----------------------------------------------

  it("🔴 R-i · refuses to emit when a required global resolves to null", async () => {
    // Deactivate the only branch that holds address/geo/hours — exactly the
    // D-029 failure the rule exists for.
    await withClient(async (client) => {
      await client.query("UPDATE branches SET is_active = false WHERE slug = 'chikkadpally'");
    });

    try {
      const broken = await loadContent();
      expect(() => assertUsable(broken)).toThrow(/resolved to null/);
      expect(() => assertUsable(broken)).toThrow(/D-029/);
    } finally {
      await withClient(async (client) => {
        await client.query("UPDATE branches SET is_active = true WHERE slug = 'chikkadpally'");
      });
    }
  });

  it("🔴 R-i / X-25 · refuses to emit when brand media is missing", async () => {
    await withClient(async (client) => {
      await client.query("UPDATE site_settings SET logo_media_id = NULL WHERE id = 1");
    });

    try {
      const broken = await loadContent();
      expect(() => assertUsable(broken)).toThrow(/site\.logo is null/);
      // The message must name the fix, not just the fault.
      expect(() => assertUsable(broken)).toThrow(/seed stage S2/);
    } finally {
      await simulateStageS2();
    }
  });

  it("🔴 R-i · refuses to emit an empty collection", () => {
    expect(() => assertUsable({ ...content, services: [] })).toThrow(/services is empty/);
    expect(() => assertUsable({ ...content, faqs: [] })).toThrow(/faqs is empty/);
  });

  it("🔴 R-i · refuses to emit without phones — 8 call sites read phones[0]", () => {
    const broken = {
      ...content,
      settings: { ...content.settings, phones: [] },
    };
    expect(() => assertUsable(broken)).toThrow(/phones is empty/);
  });

  /**
   * 🔴 GEN-SEO-03 — the collections that used to slip through.
   *
   * `assertUsable` guarded only services/testimonials/videos/faqs/jobs. An
   * empty `page_meta`, `content_lists`, `stats`, `gallery` or `content_blocks`
   * response emitted an EMPTY module and exited 0: a green deploy in which the
   * statistics band, the "why choose us" list, the gallery or every page
   * heading had silently disappeared.
   */
  it("🔴 GEN-SEO-03 · refuses to emit an empty gallery", () => {
    expect(() => assertUsable({ ...content, gallery: [] })).toThrow(/gallery is empty/);
  });

  it("🔴 GEN-SEO-03 · refuses to emit empty content lists", () => {
    expect(() => assertUsable({ ...content, contentLists: [] })).toThrow(
      /content-lists is empty/,
    );
  });

  it("🔴 GEN-SEO-03 · refuses to emit empty page metadata", () => {
    expect(() => assertUsable({ ...content, pageMeta: [] })).toThrow(/page-meta is empty/);
  });

  it("🔴 GEN-SEO-03 · refuses to emit empty page copy — 41 slots of headings", () => {
    expect(() => assertUsable({ ...content, contentBlocks: [] })).toThrow(
      /content-blocks is empty/,
    );
  });

  it("🔴 GEN-SEO-03 · refuses to emit empty statistics", () => {
    const broken = { ...content, settings: { ...content.settings, stats: [] } };
    expect(() => assertUsable(broken)).toThrow(/stats is empty/);
  });

  it("GEN-SEO-03 · requires the identity fields the whole site reads", () => {
    for (const field of ["tagline", "description"] as const) {
      const broken = { ...content, settings: { ...content.settings, [field]: null } };
      expect(() => assertUsable(broken), field).toThrow(/is missing/);
    }
  });

  /**
   * 🔴 The other half of GEN-SEO-03, and the half that protects CORRECT data.
   *
   * Over-strict validation is the opposite failure and just as damaging: it
   * would fail every production build on data that is legitimately incomplete.
   * Bowenpally's address, coordinates, map and hours are genuinely NULL pending
   * client input (D-029), and `posts` is legitimately empty (D-036). None of
   * those may ever fail the build.
   */
  it("🔴 ACCEPTS real seeded content unchanged — no false build failure", () => {
    expect(() => assertUsable(content)).not.toThrow();
  });

  it("🔴 ACCEPTS zero blog posts — the real state, not an error (D-036)", () => {
    expect(() => assertUsable({ ...content, posts: [] })).not.toThrow();
  });

  it("🔴 ACCEPTS a branch whose address, geo, map and hours are all NULL (D-029)", () => {
    // This is exactly Bowenpally. Requiring these would fail every build until
    // the client supplies facts nobody is allowed to invent.
    const withNullBranch = {
      ...content,
      settings: {
        ...content.settings,
        branches: [
          ...(content.settings.branches ?? []),
          {
            name: "Probe branch",
            phone: "+919000000000",
            address: null,
            geo: null,
            mapsUrl: null,
            mapEmbedSrc: null,
            hours: null,
          },
        ],
      },
    };
    expect(() => assertUsable(withNullBranch)).not.toThrow();
  });

  it("names every problem at once rather than failing on the first", () => {
    // An operator fixing a broken seed should see the whole list in one run.
    let message = "";
    try {
      assertUsable({ ...content, gallery: [], pageMeta: [], contentLists: [] });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("gallery is empty");
    expect(message).toContain("page-meta is empty");
    expect(message).toContain("content-lists is empty");
  });

  it("is deterministic — two runs produce byte-identical output", async () => {
    /**
     * 🔴 BOTH generations happen HERE, back to back.
     *
     * This previously compared a fresh generation against `files`, captured in
     * `beforeAll` near the top of the file. That cannot distinguish "the
     * generator is non-deterministic" from "the database changed during the
     * suite" — and once SEO-01 made `updatedAt` part of the emitted services,
     * the second thing started happening: tests between the two points mutate
     * and restore rows, and every content table carries a
     * `<table>_set_updated_at` trigger, so a restore still bumps the timestamp.
     *
     * Generating twice against the same database state tests the property that
     * actually matters — same input, same bytes — and is immune to unrelated
     * tests moving the fixture underneath it.
     */
    const first = generateAll(await loadContent()) as Record<string, string>;
    const again = generateAll(await loadContent()) as Record<string, string>;

    expect(Object.keys(again).sort()).toEqual(Object.keys(first).sort());
    for (const name of Object.keys(first)) {
      expect(again[name], name).toBe(first[name]);
    }
  });

  it("emits no `undefined` or `[object Object]` anywhere", () => {
    for (const [name, source] of Object.entries(files)) {
      expect(source, name).not.toContain("undefined");
      expect(source, name).not.toContain("[object Object]");
      expect(source, name).not.toContain("NaN");
    }
  });
});
