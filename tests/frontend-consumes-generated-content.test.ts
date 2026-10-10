/**
 * 🔴 NO FRONTEND PAGE MAY KEEP ITS OWN COPY OF ADMIN-MANAGED CONTENT.
 *
 * The whole point of the backend is `hardcoded data → existing UI` becoming
 * `backend data → the SAME existing UI`. A component that still holds its own
 * array breaks that silently, and in the worst possible way: while the two
 * copies agree, everything looks correct. The divergence only appears at the
 * first edit — the moment an owner is watching, and the moment the system is
 * least able to explain itself.
 *
 * Two real instances, both found by reading rather than by any test:
 *
 *   · `about/page.tsx` declared `const philosophy = [...]` that was
 *     BYTE-IDENTICAL to the generated `philosophy` export it shadowed. Editing
 *     a philosophy item would have updated the database, updated the generated
 *     file, and left the page showing the original text for ever.
 *
 *   · `Hero.tsx` declared `const heroStats = [...]` with `8+ Years
 *     practising`, `3000+ Patients treated`, `10 Therapies` — while the
 *     statistics band on the same page read the database. That divergence is
 *     precisely why D-023 added `stats.hero_label`; the generator emitted
 *     `heroLabel` and `showInHero` and NOTHING read either field.
 *
 * So this file asserts two different properties, because the two defects have
 * different shapes: one shadowed a generated NAME, the other duplicated
 * generated VALUES under a different name.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND = resolve(import.meta.dirname, "..", "..", "frontend");
const SRC = resolve(FRONTEND, "src");

const describeIfFrontend = existsSync(SRC) ? describe : describe.skip;

function walk(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) return [];
  let out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(path, extensions));
    else if (extensions.some((e) => entry.name.endsWith(e))) out.push(path);
  }
  return out;
}

/**
 * Comments stripped.
 *
 * ⚠ Necessary, not tidiness. The comment explaining *why* `Hero.tsx` must not
 * hardcode "Years practising" quotes the phrase, and a scanner that reads
 * comments flags the explanation as the offence — so the test fails loudest on
 * the file that was just fixed, and the obvious way to quieten it is to delete
 * the explanation. A check that punishes documentation is worse than no check.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/** Component and page sources — everything that renders, nothing generated. */
function renderingSources(): Array<{ file: string; source: string }> {
  return [...walk(resolve(SRC, "app"), [".tsx"]), ...walk(resolve(SRC, "components"), [".tsx"])]
    .map((file) => ({
      file: file.replace(FRONTEND, "").split(sep).join("/"),
      source: stripComments(readFileSync(file, "utf8")),
    }));
}

/** The array exports the generator emits, which are the CMS-owned collections. */
const GENERATED_COLLECTIONS = [
  "services",
  "testimonials",
  "videos",
  "galleryImages",
  "jobs",
  "faqs",
  "stats",
  "whyChooseUs",
  "process",
  "philosophy",
  "aboutStory",
  "achievements",
  "posts",
];

describeIfFrontend("the frontend consumes generated content, not its own copy", () => {
  it("every collection this test names is really a generated export", () => {
    // Guards the test's own premise: a renamed export would silently make the
    // assertions below vacuous.
    const generated = [
      readFileSync(resolve(SRC, "content", "site-content.ts"), "utf8"),
      readFileSync(resolve(SRC, "content", "services.ts"), "utf8"),
      readFileSync(resolve(SRC, "content", "testimonials.ts"), "utf8"),
      readFileSync(resolve(SRC, "content", "media.ts"), "utf8"),
      readFileSync(resolve(SRC, "content", "careers.ts"), "utf8"),
      readFileSync(resolve(SRC, "content", "posts.ts"), "utf8"),
    ].join("\n");

    for (const name of GENERATED_COLLECTIONS) {
      expect(generated, `${name} is not exported by any generated module`).toMatch(
        new RegExp(`export const ${name}\\b`),
      );
    }
  });

  /**
   * 🔴 The `philosophy` defect: a local declaration shadowing a generated name.
   */
  it("🔴 no page or component declares its own copy of a generated collection", () => {
    const offences: string[] = [];

    for (const { file, source } of renderingSources()) {
      for (const name of GENERATED_COLLECTIONS) {
        // `const philosophy = [` / `let stats = [` at any indentation.
        const declaration = new RegExp(`^\\s*(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*\\[`, "m");
        if (declaration.test(source)) {
          offences.push(`${file} declares its own \`${name}\``);
        }
      }
    }

    expect(
      offences,
      "these shadow admin-managed content, so editing it in the admin panel changes the " +
        "database and the generated file and never the page",
    ).toEqual([]);
  });

  /**
   * 🔴 The `heroStats` defect: the same VALUES under a different name.
   *
   * Compares against the text actually authored in the CMS rather than against
   * a list of forbidden phrases, so it keeps working as the content changes.
   * `stats` labels are the sharpest probe available — short, distinctive, and
   * owned by the database beyond argument.
   */
  it("🔴 no component hardcodes a statistic's label or value text", () => {
    const siteContent = readFileSync(resolve(SRC, "content", "site-content.ts"), "utf8");

    // Every label and heroLabel the generator emitted for `stats`.
    const statsBlock = /export const stats: Stat\[\] = \[([\s\S]*?)\n\];/.exec(siteContent);
    expect(statsBlock, "could not locate the generated stats block").not.toBeNull();

    const labels = [
      ...(statsBlock?.[1] ?? "").matchAll(/(?:heroLabel|label): "([^"]+)"/g),
    ]
      .map((m) => m[1] as string)
      // ⚠ Multi-word labels only. A one-word label is not evidence of
      // duplication: `<Rail label="Therapies">` is a section heading that
      // happens to collide with the statistic whose heroLabel is "Therapies",
      // and flagging it would push whoever hits it towards deleting the check.
      // "Years practising" and "Patients treated" are distinctive enough that a
      // literal can only be a copy — and they are what the removed `heroStats`
      // array actually contained, so the probe still catches the real defect.
      .filter((label) => label.includes(" "));

    expect(labels.length).toBeGreaterThan(2);

    const offences: string[] = [];
    for (const { file, source } of renderingSources()) {
      // The generated modules are the one legitimate home for these strings,
      // and nothing under app/ or components/ is generated.
      for (const label of labels) {
        if (source.includes(`"${label}"`)) {
          offences.push(`${file} hardcodes the statistic label "${label}"`);
        }
      }
    }

    expect(
      offences,
      "a statistic's wording belongs to the `stats` rows (D-023 added `hero_label` precisely " +
        "so the hero could have its own). A literal here means an owner can edit the number " +
        "and watch the page not change.",
    ).toEqual([]);
  });

  /**
   * The positive half: the two repaired surfaces must still READ the data.
   *
   * Removing the hardcoded array is not the fix — using the generated one is.
   * A component that imports nothing renders nothing, which would pass the two
   * negative assertions above.
   */
  /*
   * ⚠ Updated by D-042 tranche 1, and deliberately made STRICTER.
   *
   * These two assertions used to require a static import from
   * `@/content/site-content` — the generated snapshot. Tranche 1 moves these
   * surfaces to the runtime readers, which is a strictly better CMS source: the
   * snapshot only refreshes on a deployment, the reader refreshes on tag
   * revalidation. So each now requires the READER, which also blocks a
   * regression back to the build-time snapshot.
   *
   * The property being defended is unchanged — these pages must not hold their
   * own copy of admin-managed content — and the negative assertions above,
   * which are the ones that caught the original bug, still pass untouched.
   */
  it("🔴 the About page reads philosophy from the CMS at runtime", () => {
    const source = readFileSync(resolve(SRC, "app", "about", "page.tsx"), "utf8");
    expect(source).toMatch(/getPhilosophy/);
    expect(source).toMatch(/from\s*"@\/lib\/content"/);
    expect(source).toContain("philosophy.map");
    // Not back via the snapshot.
    expect(source).not.toMatch(/import\s*\{[^}]*\bphilosophy\b[^}]*\}\s*from\s*"@\/content\/site-content"/);
  });

  it("🔴 the hero resolves its statistics from the CMS using D-023's rule", () => {
    const source = readFileSync(resolve(SRC, "components", "sections", "Hero.tsx"), "utf8");

    expect(source).toMatch(/getStats/);
    expect(source).toMatch(/from\s*"@\/lib\/content"/);
    // `showInHero` selects the rows; `heroLabel ?? label` is the resolution
    // rule. Both fields were emitted and unread before 2026-10-10.
    expect(source).toContain("showInHero");
    expect(source).toMatch(/heroLabel\s*\?\?\s*/);
    expect(source).not.toMatch(/import\s*\{[^}]*\bstats\b[^}]*\}\s*from\s*"@\/content\/site-content"/);
  });
});
