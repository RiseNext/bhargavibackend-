/**
 * Admin navigation integrity.
 *
 * Every internal link the admin renders must resolve to a page that exists.
 * Two did not when the nav was first extended — `/admin/applications` and
 * `/admin/audit` had endpoints but no screen — and nothing caught it, because a
 * 404 inside an authenticated panel is invisible to every other test.
 *
 * This walks the admin tree, extracts the `href`s, and checks each one maps to
 * a real `page.tsx`, honouring Next's `[param]` segments.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const APP = resolve(ROOT, "src", "app");
const ADMIN = resolve(APP, "admin");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  let out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(path));
    else if (entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/**
 * Every internal `/admin/...` link in the admin tree — STATIC and TEMPLATED.
 *
 * 🔴 THE 404 THIS EXTRACTOR USED TO MISS.
 *
 * The original pattern was `/href="(\/admin[^"${]*)"/g`. The `[^"${]` class
 * excluded any href containing `$` or `{`, which is to say it excluded every
 * template literal — and template literals are exactly how a list screen links
 * to a detail screen:
 *
 *     <Link href={`/admin/applications/${row.id}`}>
 *
 * So the suite checked seventeen hand-written paths and none of the seventeen
 * INTERPOLATED ones. `/admin/applications/[id]` was linked from the
 * applications list, had no `page.tsx`, and every admin who clicked a reference
 * number got a 404 — while this file passed, because it never looked at that
 * link. The missing page was found by a person clicking it in production.
 *
 * Each `${…}` becomes a `*` placeholder, which `pageExists` matches against a
 * bracketed `[param]` directory. That is the correct equivalence: an
 * interpolated segment is precisely a dynamic one, and a link whose
 * interpolation lands where no dynamic directory exists is a guaranteed 404
 * rather than a possible one.
 */
function adminLinks(): Array<{ file: string; href: string }> {
  const out: Array<{ file: string; href: string }> = [];

  for (const file of walk(ADMIN)) {
    const source = readFileSync(file, "utf8");
    const relative = file.replace(ROOT, "").replace(/\\/g, "/");

    // Plain string hrefs, with no interpolation.
    for (const match of source.matchAll(/href="(\/admin[^"${]*)"/g)) {
      const href = match[1];
      if (href) out.push({ file: relative, href });
    }

    // Template-literal hrefs: href={`/admin/…${x}…`}
    for (const match of source.matchAll(/href=\{`(\/admin[^`]*)`\}/g)) {
      const raw = match[1];
      if (raw === undefined) continue;
      // `${expr}` → one wildcard segment. Nested braces do not occur in these
      // call sites, and a greedy match would swallow the rest of the path.
      out.push({ file: relative, href: raw.replace(/\$\{[^}]*\}/g, "*") });
    }
  }
  return out;
}

/**
 * Resolves a URL path to a page file, treating any directory whose name is
 * bracketed as matching one segment.
 *
 * A `*` segment comes from a `${…}` interpolation and may only match a dynamic
 * `[param]` directory — never a literal one, because the interpolated value is
 * a runtime id, not a fixed word. A `[...catchAll]` directory absorbs all
 * remaining segments, as Next does.
 */
function pageExists(urlPath: string): boolean {
  const segments = urlPath.split("?")[0]?.split("/").filter(Boolean) ?? [];

  const descend = (dir: string, remaining: string[]): boolean => {
    if (remaining.length === 0) return existsSync(join(dir, "page.tsx"));

    const [head, ...tail] = remaining;
    if (head === undefined) return false;

    // An exact segment wins over a dynamic one, matching Next's own resolution.
    // Skipped for a wildcard: `${id}` cannot resolve to a literal directory.
    if (head !== "*") {
      const exact = join(dir, head);
      if (existsSync(exact) && descend(exact, tail)) return true;
    }

    if (!existsSync(dir)) return false;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith("[")) continue;
      // A catch-all consumes the rest of the path.
      if (entry.name.startsWith("[...") || entry.name.startsWith("[[...")) {
        if (existsSync(join(dir, entry.name, "page.tsx"))) return true;
        continue;
      }
      if (descend(join(dir, entry.name), tail)) return true;
    }
    return false;
  };

  return descend(APP, segments);
}

describe("admin navigation", () => {
  const links = adminLinks();

  it("renders some internal links at all", () => {
    // A link extractor that silently found none would make this suite useless.
    expect(links.length).toBeGreaterThan(5);
  });

  /**
   * 🔴 Guards the EXTRACTOR, not the routes.
   *
   * The bug was never a wrong assertion — it was an assertion that never ran,
   * because the regex could not see interpolated links. Restoring the old
   * pattern would make every test below pass again by examining nothing, so the
   * extractor's own reach has to be asserted explicitly.
   *
   * `/admin/applications/*` is named deliberately: it is the link that 404'd in
   * production, and it only exists in the list as a template literal.
   */
  it("🔴 extracts template-literal links, which is how the applications 404 hid", () => {
    const hrefs = links.map((l) => l.href);

    expect(
      hrefs,
      "the detail link from the applications list is a template literal; if it is not " +
        "extracted, nothing checks that /admin/applications/[id] exists",
    ).toContain("/admin/applications/*");

    // Several screens link to a detail page this way; a handful proves the
    // extractor is general rather than special-cased to one path.
    const templated = [...new Set(hrefs.filter((h) => h.includes("*")))];
    expect(templated.length).toBeGreaterThanOrEqual(5);
  });

  it("🔴 an interpolated segment never resolves to a literal directory", () => {
    // `/admin/content/*` must match via `[collection]`. If `*` were allowed to
    // match a literal name, the resolver would accept paths Next would 404,
    // which would make the whole suite permissive in exactly the wrong way.
    expect(pageExists("/admin/this-literal-segment-does-not-exist")).toBe(false);
    expect(pageExists("/admin/applications/*")).toBe(true);
  });

  const unique = [...new Set(links.map((l) => l.href))].sort();

  for (const href of unique) {
    it(`${href} resolves to a page`, () => {
      const sources = links.filter((l) => l.href === href).map((l) => l.file);
      expect(
        pageExists(href),
        `${href} is linked from ${sources.join(", ")} but no page.tsx resolves it — ` +
          "an authenticated 404 is invisible to every other test.",
      ).toBe(true);
    });
  }
});

describe("admin screens cover the collections they claim", () => {
  it("every collection in the UI schema has a reachable list screen", async () => {
    const { COLLECTION_SLUGS } = await import("@/lib/admin/ui-schema");

    // All ten go through the one dynamic route, so this checks the route
    // exists rather than ten separate files.
    expect(pageExists("/admin/content/services")).toBe(true);
    expect(COLLECTION_SLUGS.length).toBe(10);

    for (const slug of COLLECTION_SLUGS) {
      expect(pageExists(`/admin/content/${slug}`), slug).toBe(true);
      expect(pageExists(`/admin/content/${slug}/new`), `${slug}/new`).toBe(true);
    }
  });

  it("every collection's admin API exists for the screen to call", () => {
    const api = resolve(APP, "api", "admin");
    const slugs = [
      "services",
      "testimonials",
      "videos",
      "gallery",
      "faqs",
      "jobs",
      "posts",
      "stats",
      "social-links",
      "content-lists",
    ];

    for (const slug of slugs) {
      expect(existsSync(join(api, slug, "route.ts")), `${slug} list`).toBe(true);
      expect(existsSync(join(api, slug, "[id]", "route.ts")), `${slug} detail`).toBe(true);
    }
  });
});
