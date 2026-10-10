/**
 * 🔴 THE RUNTIME READERS MUST PRODUCE EXACTLY WHAT THE GENERATOR PRODUCED.
 *
 * D-042 moves content from build-time generation to runtime fetching. That
 * migration is only safe if the new path yields byte-identical data to the old
 * one, because the old one is what produced the website as it looks today —
 * D-010 forbids any visual change, and a silently different shape is a visual
 * change nobody reviewed.
 *
 * The risk is not hypothetical. The generator distinguishes ABSENT from FALSY
 * throughout: `when`, `featured`, `translation`, `heroLabel`, `showInHero`,
 * `priceFrom` and `typicalCourse` are omitted rather than emitted as `null` or
 * `false`, and `featuredTestimonials` / `featuredVideos` are derived by
 * `.filter(x => x.featured)`. A shaper that emitted `featured: false` would
 * pass a casual eyeball, typecheck cleanly, and silently empty two carousels.
 *
 * So this compares the two implementations directly, on the same input, field
 * for field — with fixtures chosen to sit on exactly those boundaries.
 *
 * ⚠ `content-shapes.ts` is importable here only because its `@/content/*`
 * imports are all `import type`, which esbuild erases. That is why the pure
 * shapers were split out of `content.ts`, which is `server-only` and would
 * throw.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND = resolve(import.meta.dirname, "..", "..", "frontend");
const SHAPES = resolve(FRONTEND, "src", "lib", "content-shapes.ts");
const GENERATOR = resolve(import.meta.dirname, "..", "generator", "generate-content.mjs");

const describeIfFrontend = existsSync(SHAPES) ? describe : describe.skip;

/** Parses the single array literal a generator `emit*` produced. */
function emittedArray(source: string, exportName: string): unknown {
  const re = new RegExp(`export const ${exportName}(?:: [^=]+)? = (\\[[\\s\\S]*?\\n\\]);`);
  const match = re.exec(source);
  expect(match, `${exportName} not found in generated source`).not.toBeNull();
  // The generator emits a JS literal with unquoted identifier keys; `Function`
  // is the honest way to read its own output format back.
  return new Function(`return ${match?.[1] ?? "[]"}`)() as unknown;
}

describeIfFrontend("runtime readers ≡ build-time generator", () => {
  /**
   * Fixtures sit on the absent/falsy boundary deliberately:
   * one row with every optional field present, one with every one absent.
   */
  const settings = {
    name: "Bhargavi Health World",
    stats: [
      { value: 8, suffix: "+", label: "Years of expertise", heroLabel: "Years practising", showInHero: true },
      { value: 1000, suffix: "+", label: "Acupuncture cases", heroLabel: null, showInHero: false },
    ],
  };

  const content = {
    settings,
    services: [
      {
        slug: "acupuncture", title: "Acupuncture", excerpt: "x", image: "https://i/x.jpg",
        duration: "45 min", treats: ["a"], body: ["b"], updatedAt: "2026-10-01T00:00:00.000Z",
        priceFromPaise: 10_000, typicalCourse: "2–4 sittings",
      },
      {
        slug: "cupping-therapy", title: "Cupping", excerpt: "y", image: "https://i/y.jpg",
        duration: "30 min", treats: ["c"], body: ["d"], updatedAt: "2026-10-02T00:00:00.000Z",
        priceFromPaise: null, typicalCourse: null,
      },
    ],
    testimonials: [
      { name: "A", quote: "q1", when: "a year ago", featured: true },
      { name: "B", quote: "q2", when: null, featured: false },
    ],
    videos: [
      { id: "abcdefghijk", title: "V1", translation: "Telugu", featured: true },
      { id: "lmnopqrstuv", title: "V2", translation: null, featured: false },
    ],
    gallery: [{ src: "https://i/g.jpg", alt: "g" }],
    faqs: [{ question: "Q?", answer: "A." }],
    jobs: [],
    contentLists: [],
    contentBlocks: [],
    pageMeta: [],
    posts: [],
  };

  async function shapers() {
    return (await import(resolve(SHAPES))) as {
      shapeService: (r: unknown) => unknown;
      shapeTestimonial: (r: unknown) => unknown;
      shapeVideo: (r: unknown) => unknown;
      shapeStat: (r: unknown) => unknown;
      formatRupees: (p: number) => string;
    };
  }

  async function generator() {
    return (await import(GENERATOR)) as {
      emitServices: (c: unknown) => string;
      emitTestimonials: (c: unknown) => string;
      emitMedia: (c: unknown) => string;
      emitSiteContent: (c: unknown) => string;
      formatRupees: (p: number) => string;
    };
  }

  it("🔴 testimonials — including the absent/falsy boundary", async () => {
    const { shapeTestimonial } = await shapers();
    const { emitTestimonials } = await generator();

    const runtime = content.testimonials.map(shapeTestimonial);
    const generated = emittedArray(emitTestimonials(content), "testimonials");

    expect(runtime).toEqual(generated);
    // Explicit: the un-featured row must have NO `featured` key at all, or
    // `featuredTestimonials` silently changes.
    expect(Object.keys(runtime[1] as object)).not.toContain("featured");
    expect(Object.keys(runtime[1] as object)).not.toContain("when");
  });

  it("🔴 videos — `translation` and `featured` omitted, not falsy", async () => {
    const { shapeVideo } = await shapers();
    const { emitMedia } = await generator();

    const runtime = content.videos.map(shapeVideo);
    expect(runtime).toEqual(emittedArray(emitMedia(content), "videos"));
    expect(Object.keys(runtime[1] as object)).toEqual(["id", "title"]);
  });

  it("🔴 services — price formatting and omitted optional fields", async () => {
    const { shapeService } = await shapers();
    const { emitServices } = await generator();

    const runtime = content.services.map(shapeService);
    expect(runtime).toEqual(emittedArray(emitServices(content), "services"));
    // "From ₹100" — no decimals on a whole-rupee amount.
    expect((runtime[0] as { priceFrom?: string }).priceFrom).toBe("From ₹100");
    expect(Object.keys(runtime[1] as object)).not.toContain("priceFrom");
  });

  it("🔴 stats — D-023 heroLabel / showInHero omitted when not set", async () => {
    const { shapeStat } = await shapers();
    const { emitSiteContent } = await generator();

    const runtime = settings.stats.map(shapeStat);
    expect(runtime).toEqual(emittedArray(emitSiteContent(content), "stats"));
    expect(Object.keys(runtime[1] as object)).toEqual(["value", "suffix", "label"]);
  });

  it("formatRupees agrees with the generator on fractional amounts too", async () => {
    const a = (await shapers()).formatRupees;
    const b = (await generator()).formatRupees;
    for (const paise of [10_000, 12_550, 1, 99, 100_000]) {
      expect(a(paise), `paise=${String(paise)}`).toBe(b(paise));
    }
  });

  /**
   * 🔴 D-023's resolution rule, which the hero depends on and which had no
   * consumer at all until 2026-10-10. Asserted on the real seeded wording so a
   * reordering or a dropped `showInHero` flag is caught here rather than on the
   * homepage.
   */
  it("🔴 hero statistics resolve to the three the hero has always shown", async () => {
    const { shapeStat } = await shapers();
    const resolved = settings.stats
      .map(shapeStat)
      .filter((s) => (s as { showInHero?: boolean }).showInHero)
      .map((s) => {
        const r = s as { value: number; suffix: string; heroLabel?: string; label: string };
        return { k: `${String(r.value)}${r.suffix}`, v: r.heroLabel ?? r.label };
      });

    expect(resolved).toEqual([{ k: "8+", v: "Years practising" }]);
  });
});
