/**
 * 🔴 THE PUBLISH PATH'S WIRE CONTRACT — D-042.
 *
 * Publishing is now "the backend names a cache tag and the frontend invalidates
 * it". That makes the tag vocabulary a cross-repository contract carried in
 * plain strings, which is the easiest kind of contract to break silently: a
 * rename on one side and the collection simply stops publishing.
 *
 * The old architecture's entire failure was a publish trigger that quietly did
 * nothing. These tests exist so the replacement cannot fail the same way, and
 * they target the three ways it could:
 *
 *   1. the two tag lists drift apart;
 *   2. an admin collection maps to NO tag, so mutating it publishes nothing;
 *   3. the frontend route accepts an unknown tag instead of rejecting it.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ALL_REVALIDATE_TAGS, REVALIDATE_TAGS, tagsForReason } from "@/lib/revalidate";

const FRONTEND = resolve(import.meta.dirname, "..", "..", "frontend");
const ROUTE = resolve(FRONTEND, "src", "app", "api", "revalidate", "route.ts");
const CONTENT = resolve(FRONTEND, "src", "lib", "content.ts");

const describeIfFrontend = existsSync(CONTENT) ? describe : describe.skip;

/** The frontend's tag values, read from source rather than imported. */
function frontendTags(): string[] {
  const source = readFileSync(CONTENT, "utf8");
  const block = /export const CONTENT_TAGS = \{([\s\S]*?)\} as const;/.exec(source);
  expect(block, "CONTENT_TAGS not found in frontend/src/lib/content.ts").not.toBeNull();
  return [...(block?.[1] ?? "").matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1] as string).sort();
}

describeIfFrontend("revalidation contract", () => {
  it("🔴 both repositories agree on the tag vocabulary, exactly", () => {
    const backend = [...ALL_REVALIDATE_TAGS].sort();
    const frontend = frontendTags();

    expect(backend.length).toBeGreaterThan(5);
    expect(
      frontend,
      "the backend names tags the frontend does not know (or vice versa). The frontend " +
        "rejects an unknown tag with 422, so a drift here makes that collection " +
        "unpublishable — loudly, but still unpublishable.",
    ).toEqual(backend);
  });

  /**
   * 🔴 Every collection an administrator can mutate must map to a tag.
   *
   * An unmapped collection is the new shape of the old bug: the save succeeds,
   * the audit row is written, and nothing is ever invalidated. The list below is
   * the admin API's own surface, so adding a collection without a tag fails
   * here rather than in production.
   */
  it("🔴 every admin-mutable collection maps to at least one tag", () => {
    const collections = [
      "services", "testimonials", "videos", "gallery", "faqs", "jobs", "posts",
      "content-lists", "stats", "social-links", "branches", "site-settings",
      "content-blocks", "content-block-items", "page-copy", "page-meta",
    ];

    const unmapped = collections.filter((c) => tagsForReason(`${c}:update`).length === 0);
    expect(
      unmapped,
      "these collections would be saved and never published",
    ).toEqual([]);
  });

  it("maps the real mutation reasons the CRUD factory emits", () => {
    for (const op of ["create", "update", "delete", "publish", "reorder"]) {
      expect(tagsForReason(`faqs:${op}`), op).toContain(REVALIDATE_TAGS.faqs);
    }
    // Nested reasons like `posts:blocks:reorder` key off the first segment.
    expect(tagsForReason("posts:blocks:reorder")).toContain(REVALIDATE_TAGS.posts);
  });

  /**
   * ⚠ The couplings a naive one-to-one map gets wrong. Each of these would
   * publish nothing while looking correct.
   */
  it("🔴 collections served by /api/site-settings invalidate site-settings", () => {
    // There is no endpoint behind a `stats` tag, so a `stats` tag would be a
    // 422 — and statistics would never reach the homepage.
    for (const c of ["stats", "social-links", "branches"]) {
      expect(tagsForReason(`${c}:update`), c).toEqual([REVALIDATE_TAGS.settings]);
    }
  });

  it("services and posts also invalidate page-meta, which carries their SEO rows", () => {
    expect(tagsForReason("services:update")).toContain(REVALIDATE_TAGS.pageMeta);
    expect(tagsForReason("posts:update")).toContain(REVALIDATE_TAGS.pageMeta);
  });

  it("an unknown collection maps to nothing, so the caller can report it", () => {
    // Deliberately NOT a silent default to every tag: invalidating the whole
    // site on a typo would hide the mistake behind a working site.
    expect(tagsForReason("not-a-collection:update")).toEqual([]);
  });
});

describeIfFrontend("the frontend revalidate route's security invariants", () => {
  const source = (): string => readFileSync(ROUTE, "utf8");

  it("🔴 compares the secret in constant time", () => {
    // A plain `===` on a secret leaks its prefix one byte at a time.
    expect(source()).toContain("timingSafeEqual");
    expect(source()).not.toMatch(/provided\s*===\s*expected/);
  });

  it("🔴 refuses when no secret is configured, rather than allowing", () => {
    // An unset secret must never mean "no auth required" — that turns a
    // misconfiguration into an open endpoint.
    // Generous window: the branch carries the comment explaining WHY it
    // refuses, and a check that punishes documentation gets documentation
    // deleted.
    expect(source()).toMatch(/if \(!expected\)[\s\S]{0,400}?503/);
  });

  it("🔴 rejects unknown tags instead of ignoring them", () => {
    expect(source()).toContain("422");
    expect(source()).toContain("Unknown tag");
  });

  it("returns the list it actually revalidated, so the caller can verify", () => {
    expect(source()).toContain("revalidated");
  });

  it("is never cached and never indexed", () => {
    expect(source()).toContain("no-store");
    expect(source()).toContain("noindex");
  });

  it("the secret is server-only — never NEXT_PUBLIC_*", () => {
    expect(source()).toContain("process.env.REVALIDATE_SECRET");
    expect(source()).not.toContain("NEXT_PUBLIC_REVALIDATE");
  });

  it("🔴 the backend sends the secret in a header, never a query string", () => {
    // A secret in a URL lands in every access log between the two hosts.
    const backend = readFileSync(
      resolve(import.meta.dirname, "..", "src", "lib", "revalidate.ts"),
      "utf8",
    );
    expect(backend).toContain('"x-revalidate-secret": secret');
    expect(backend).not.toMatch(/\?secret=|&secret=/);
  });

  it("🔴 a partial revalidation is reported as a failure, not a success", () => {
    const backend = readFileSync(
      resolve(import.meta.dirname, "..", "src", "lib", "revalidate.ts"),
      "utf8",
    );
    // Trusting our own request instead of the frontend's confirmation is how
    // "queued" became indistinguishable from "published" the first time.
    expect(backend).toContain("missing.length > 0");
  });
});
