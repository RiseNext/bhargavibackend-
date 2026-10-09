/**
 * 🔴 Media URLs that are PRESENT but WRONG must fail the build.
 *
 * THE RELEASE THIS EXISTS TO STOP — reconstructed from evidence:
 *
 *   12:46:45Z  `npm run seed:local-full` wrote 26 SYNTHETIC media rows whose
 *              `secure_url` pointed at Cloudinary's public `demo` cloud under a
 *              `bhw-local/` prefix, and recorded S2 in `_seed_stages`.
 *   16:07:48Z  `npm run assets:migrate` uploaded the 26 real assets to the
 *              clinic's own cloud under `bhw/dev` and wrote a verified manifest.
 *
 * Because the ledger already said "s2", the REAL S2 — the only step that
 * ingests that manifest — was skipped as already applied. The manifest was
 * never read. Content generated from the placeholder rows emitted 25 demo-cloud
 * URLs, and the committed result rendered 125 broken images across all 19
 * public routes, including the header logo and the founder portrait.
 *
 * Typecheck, lint, both production builds and 963 tests were all green
 * throughout, because every existing check asked "is the content MISSING?" and
 * none asked "is it WRONG?".
 *
 * Three independent defences are asserted here. Any ONE of them would have
 * stopped that release.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mediaUrlProblems } from "../generator/generate-content.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const FRONTEND = resolve(ROOT, "..", "frontend");
const read = (p: string): string => readFileSync(p, "utf8");

/**
 * Minimal content shaped like the generator's input, carrying each URL EXACTLY
 * once — the guard counts occurrences, so a helper that duplicated one would
 * make the count assertions meaningless.
 */
const withUrls = (...urls: string[]): unknown => ({
  settings: { logo: null },
  gallery: urls.map((u) => ({ src: u })),
});

describe("🔴 defence 1 · the generator refuses demo-cloud media", () => {
  it("rejects Cloudinary's public sample cloud", () => {
    const problems = mediaUrlProblems(
      withUrls("https://res.cloudinary.com/demo/image/upload/v1/bhw-local/brand/23.jpg"),
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).toMatch(/demo/);
    // The message must say how to fix it, not just that it is wrong.
    expect(problems.join(" ")).toMatch(/assets:migrate/);
    expect(problems.join(" ")).toMatch(/stage s2/);
  });

  it("counts every offending URL, so the scale is visible", () => {
    const problems = mediaUrlProblems(
      withUrls(
        "https://res.cloudinary.com/demo/image/upload/v1/a.jpg",
        "https://res.cloudinary.com/demo/image/upload/v1/b.jpg",
        "https://res.cloudinary.com/demo/image/upload/v1/c.jpg",
      ),
    );
    expect(problems.join(" ")).toMatch(/3 media URL/);
  });

  it("rejects the synthetic bhw-local/ prefix on ANY cloud", () => {
    // Swapping `demo` for the real cloud name without re-ingesting the manifest
    // was an explicitly rejected "fix". This is what catches it.
    const problems = mediaUrlProblems(
      withUrls("https://res.cloudinary.com/a-real-cloud/image/upload/v1/bhw-local/services/00.jpg"),
    );
    expect(problems.join(" ")).toMatch(/bhw-local/);
  });

  it("rejects media split across two Cloudinary accounts", () => {
    const problems = mediaUrlProblems(
      withUrls(
        "https://res.cloudinary.com/cloud-one/image/upload/v1/bhw/dev/a.jpg",
        "https://res.cloudinary.com/cloud-two/image/upload/v1/bhw/dev/b.jpg",
      ),
    );
    expect(problems.join(" ")).toMatch(/different Cloudinary clouds/);
  });

  it("🟢 accepts coherent real media — no false positives", () => {
    expect(
      mediaUrlProblems(
        withUrls(
          "https://res.cloudinary.com/clinic-cloud/image/upload/v1791475663/bhw/dev/brand/bhargavi-lockup.png",
          "https://res.cloudinary.com/clinic-cloud/image/upload/v1791475663/bhw/dev/gallery/i-img-1.jpg",
        ),
      ),
    ).toEqual([]);
  });

  it("accepts content with no media at all rather than inventing a problem", () => {
    expect(mediaUrlProblems({ settings: {}, gallery: [] })).toEqual([]);
  });

  /**
   * 🔴 THE TWO GENERATOR COPIES MUST NOT DRIFT.
   *
   * `generate-content.mjs` is authored in the backend and copied into the
   * frontend, where `prebuild` actually runs it. Nothing asserted they stayed in
   * step, and they had already diverged in size. A guard added to one copy and
   * forgotten in the other is worthless: the frontend copy is the one that gates
   * a Vercel build.
   *
   * Byte equality is deliberately NOT the assertion — the files legitimately
   * differ in their header paths. What must match is BEHAVIOUR: the same
   * exported surface, and an identical implementation of the media guard.
   */
  it("🔴 both generator copies export the same surface", () => {
    const names = (src: string): string[] =>
      [...src.matchAll(/^export function (\w+)/gm)].map((m) => m[1] as string).sort();

    const backend = names(read(resolve(ROOT, "generator", "generate-content.mjs")));
    const frontend = names(read(resolve(FRONTEND, "scripts", "generate-content.mjs")));

    expect(backend.length).toBeGreaterThan(5);
    const onlyBackend = backend.filter((n) => !frontend.includes(n));
    const onlyFrontend = frontend.filter((n) => !backend.includes(n));
    expect(
      { onlyBackend, onlyFrontend },
      "the generator copies have diverged — a function exists in one but not the other",
    ).toEqual({ onlyBackend: [], onlyFrontend: [] });
  });

  it("🔴 the media guard is implemented IDENTICALLY in both copies", () => {
    /** The function body, whitespace-normalised. */
    const guard = (src: string): string => {
      const start = src.indexOf("export function mediaUrlProblems");
      expect(start, "mediaUrlProblems not found").toBeGreaterThan(-1);
      // Up to the next top-level export, which bounds the function.
      const rest = src.slice(start + 1);
      const end = rest.search(/\n(?:export |\/\/ -{3,})/);
      return (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, " ").trim();
    };

    const backend = guard(read(resolve(ROOT, "generator", "generate-content.mjs")));
    const frontend = guard(read(resolve(FRONTEND, "scripts", "generate-content.mjs")));
    expect(
      frontend,
      "the frontend copy of mediaUrlProblems differs from the backend source of truth — " +
        "the frontend copy is the one that gates the Vercel build",
    ).toBe(backend);
  });

  it("is wired into assertUsable in BOTH generator copies", () => {
    for (const p of [
      resolve(ROOT, "generator", "generate-content.mjs"),
      resolve(FRONTEND, "scripts", "generate-content.mjs"),
    ]) {
      expect(existsSync(p), `${p} is missing`).toBe(true);
      const src = read(p);
      expect(src, `${p} does not define the guard`).toMatch(/export function mediaUrlProblems/);
      expect(src, `${p} does not call the guard from assertUsable`).toMatch(
        /problems\.push\(\.\.\.mediaUrlProblems\(content\)\)/,
      );
    }
  });
});

describe("🔴 defence 2 · a synthetic seed cannot overwrite real media", () => {
  const src = read(resolve(ROOT, "scripts", "seed-local-full.mts"));

  it("refuses when a verified upload manifest exists", () => {
    expect(src).toMatch(/MANIFEST_PATH/);
    expect(src).toMatch(/Refusing to run: a verified upload manifest exists/);
  });

  it("refuses when the database already holds non-demo media", () => {
    expect(src).toMatch(/secure_url NOT LIKE 'https:\/\/res\.cloudinary\.com\/demo\/%'/);
    expect(src).toMatch(/not demo-cloud placeholders/);
  });

  it("checks both BEFORE writing anything", () => {
    const manifestGate = src.indexOf("a verified upload manifest exists");
    const dbGate = src.indexOf("not demo-cloud placeholders");
    const firstWrite = src.indexOf("CREATE TABLE IF NOT EXISTS _seed_stages");
    expect(manifestGate).toBeGreaterThan(-1);
    expect(dbGate).toBeGreaterThan(-1);
    expect(dbGate, "the database check must precede the first write").toBeLessThan(firstWrite);
  });

  it("still offers a deliberate escape hatch", () => {
    expect(src).toMatch(/--allow-overwrite-real/);
  });
});

describe("🔴 defence 3 · a synthetic ledger entry is NOT 'applied'", () => {
  const src = read(resolve(ROOT, "scripts", "seed.ts"));

  it("completed() excludes stages recorded as synthetic", () => {
    expect(src).toMatch(/counts\?\.synthetic !== true/);
  });

  it("reads counts, not just the stage name", () => {
    // The original bug: `SELECT stage` alone could not tell real from synthetic.
    expect(src).toMatch(/SELECT stage, counts FROM _seed_stages/);
  });

  it("--status tells the operator a stage is a placeholder", () => {
    expect(src).toMatch(/SYNTHETIC placeholder/);
    expect(src).toMatch(/NOT really applied/);
  });
});

describe("🔴 release gate · the COMMITTED frontend content is clean", () => {
  const files = [
    "src/content/media.ts",
    "src/content/services.ts",
    "src/content/site-content.ts",
    "src/content/page-copy.ts",
    "src/content/page-meta.ts",
  ];

  for (const f of files) {
    const path = resolve(FRONTEND, f);
    if (!existsSync(path)) continue;

    it(`${f} ships no demo-cloud URL`, () => {
      expect(read(path), `${f} still points at the Cloudinary demo cloud`).not.toMatch(
        /res\.cloudinary\.com\/demo\//,
      );
    });

    it(`${f} ships no synthetic bhw-local/ public id`, () => {
      expect(read(path), `${f} still uses the synthetic seed prefix`).not.toMatch(/bhw-local\//);
    });
  }

  it("all committed media URLs share ONE Cloudinary account", () => {
    const clouds = new Set<string>();
    for (const f of files) {
      const path = resolve(FRONTEND, f);
      if (!existsSync(path)) continue;
      for (const m of read(path).matchAll(/res\.cloudinary\.com\/([^/]+)\//g)) {
        clouds.add(m[1] as string);
      }
    }
    // Zero is valid (nothing generated yet); more than one never is.
    expect(clouds.size, `committed content spans clouds: ${[...clouds].join(", ")}`).toBeLessThan(2);
  });
});
