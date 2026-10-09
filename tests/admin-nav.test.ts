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

/** Every static `href="/admin/..."` in the admin tree. */
function adminLinks(): Array<{ file: string; href: string }> {
  const out: Array<{ file: string; href: string }> = [];

  for (const file of walk(ADMIN)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/href="(\/admin[^"${]*)"/g)) {
      const href = match[1];
      if (href) out.push({ file: file.replace(ROOT, "").replace(/\\/g, "/"), href });
    }
  }
  return out;
}

/**
 * Resolves a URL path to a page file, treating any directory whose name is
 * bracketed as matching one segment.
 */
function pageExists(urlPath: string): boolean {
  const segments = urlPath.split("?")[0]?.split("/").filter(Boolean) ?? [];

  const descend = (dir: string, remaining: string[]): boolean => {
    if (remaining.length === 0) return existsSync(join(dir, "page.tsx"));

    const [head, ...tail] = remaining;
    if (head === undefined) return false;

    // An exact segment wins over a dynamic one, matching Next's own resolution.
    const exact = join(dir, head);
    if (existsSync(exact) && descend(exact, tail)) return true;

    if (!existsSync(dir)) return false;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith("[")) continue;
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
