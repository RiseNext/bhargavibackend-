/**
 * `robots.txt` must disallow the admin — CLAUDE.md §10.
 *
 * The route is exercised through `next`'s own serialiser rather than by reading
 * the source, because the thing that was broken before was not the content of a
 * rule but the ABSENCE of the route: `/robots.txt` returned 404 while a comment
 * in `layout.tsx` claimed otherwise. A test that only inspected a rules object
 * would have passed in that state too, so the live-route assertion in
 * `scripts/verify-robots.mts` is the companion to this file.
 */
import { describe, expect, it } from "vitest";

import robots from "../src/app/robots";

describe("CLAUDE.md §10 · robots.txt on the backend host", () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
  const first = rules[0];

  it("applies to every crawler", () => {
    expect(first?.userAgent).toBe("*");
  });

  it("🔴 disallows /admin explicitly", () => {
    const disallow = first?.disallow;
    const list = Array.isArray(disallow) ? disallow : [disallow];
    expect(list).toContain("/admin");
  });

  it("disallows /api and the whole host too — nothing here is public", () => {
    const disallow = first?.disallow;
    const list = Array.isArray(disallow) ? disallow : [disallow];
    expect(list).toContain("/api");
    expect(list).toContain("/");
  });

  it("allows nothing", () => {
    // An `allow` rule beside a `/` disallow is how a crawler ends up indexing
    // the admin: longest-match wins, so one stray allow would undo the lot.
    expect(first?.allow).toBeUndefined();
  });

  it("advertises NO sitemap", () => {
    // Pointing a crawler at a sitemap on a host that disallows everything is a
    // contradiction, and the sitemap belongs to the public deployment (D-002).
    expect(result.sitemap).toBeUndefined();
  });
});
