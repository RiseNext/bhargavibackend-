/**
 * Q-014 — every ordered list must be reproducible, including under a TIE.
 *
 * 🔴 THE DEFECT THIS GUARDS. Every collection read ended
 * `ORDER BY sort_order, created_at`, and nothing enforces that pair to be
 * unique. Postgres is then free to return tied rows in any order, and it does
 * change its mind — a row rewrite is enough. Because the generator feeds
 * `src/content/*.ts` from these reads, a tie makes the BUILD OUTPUT
 * non-reproducible: a public list silently reorders between two builds of
 * identical data.
 *
 * This was observed, not theorised. A `sort_order` tie on the disposable E2E
 * database produced 7 false route-equivalence differences across `/`,
 * `/services`, `/videos`, `/testimonials`, `/careers`, `/contact` and a service
 * detail page.
 *
 * Two of the clauses were worse than "reordering":
 *
 *   · `listPosts()` paginates with LIMIT/OFFSET. Under a tie the same row can
 *     appear on two pages or be skipped altogether — and the generator
 *     paginates `fetchAllPosts()`, so a post could vanish from the built site.
 *   · `/api/contact` resolved a lead's branch hours with
 *     `ORDER BY sort_order LIMIT 1`, implementing only the first key of
 *     D-029's documented `sortBy(sort_order ASC, created_at ASC)`. A tie made
 *     it arbitrary which branch's hours were attached to a patient enquiry.
 *
 * Each test below FORCES a tie — same `sort_order` AND same `created_at` — and
 * asserts the order is stable across repeated reads. `id` is a random UUID, so
 * the resulting order is arbitrary but *deterministic*, which is exactly the
 * property a reproducible build needs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { query } from "../src/lib/db";
import {
  listFaqs,
  listGallery,
  listServices,
  listTestimonials,
  listVideos,
  listContentBlocks,
  listContentLists,
  listPosts,
  listJobs,
} from "../src/lib/content/public";
import { buildSiteSettings } from "../src/lib/settings/site-settings";

const ROOT = resolve(import.meta.dirname, "..");
const publicSource = readFileSync(
  resolve(ROOT, "src", "lib", "content", "public.ts"),
  "utf8",
);

/** A fixed instant, so `created_at` ties too and only `id` can break it. */
const TIED_AT = "2026-01-01T00:00:00Z";

/**
 * Reads the same list several times and returns the distinct orderings seen.
 *
 * Repeated reads alone are a weak probe — a cached plan can be stable by luck.
 * So each round also runs `ANALYZE`, which is enough to change the plan and the
 * physical read order on a tied set.
 */
async function orderingsOf<T>(
  read: () => Promise<T[]>,
  key: (row: T) => string,
  table: string,
  rounds = 6,
): Promise<Set<string>> {
  const seen = new Set<string>();
  for (let i = 0; i < rounds; i++) {
    const rows = await read();
    seen.add(rows.map(key).join("|"));
    await query(`ANALYZE ${table}`);
  }
  return seen;
}

beforeAll(async () => {
  // Two rows per collection that tie on BOTH ordering keys.
  await query(
    `INSERT INTO faqs (question, answer, sort_order, published, created_at)
     VALUES ('Tie A?', 'A', 99, true, $1), ('Tie B?', 'B', 99, true, $1)`,
    [TIED_AT],
  );
  await query(
    `INSERT INTO testimonials (author_name, quote, sort_order, published, created_at)
     VALUES ('Tie A', 'qa', 99, true, $1), ('Tie B', 'qb', 99, true, $1)`,
    [TIED_AT],
  );
  await query(
    `INSERT INTO videos (youtube_id, title, sort_order, published, created_at)
     VALUES ('tieAAAAAAAA', 'Tie A', 99, true, $1), ('tieBBBBBBBB', 'Tie B', 99, true, $1)`,
    [TIED_AT],
  );
});

afterAll(async () => {
  await query("DELETE FROM faqs WHERE sort_order = 99");
  await query("DELETE FROM testimonials WHERE sort_order = 99");
  await query("DELETE FROM videos WHERE sort_order = 99");
});

describe("Q-014 · a forced (sort_order, created_at) tie still reads in ONE order", () => {
  it("faqs", async () => {
    const orders = await orderingsOf(listFaqs, (f) => f.question, "faqs");
    expect(orders.size).toBe(1);
    // …and the tie really is present, or the test proves nothing.
    const tied = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM faqs WHERE sort_order = 99",
    );
    expect(tied[0]?.n).toBe("2");
  });

  it("testimonials", async () => {
    const orders = await orderingsOf(listTestimonials, (t) => t.name, "testimonials");
    expect(orders.size).toBe(1);
  });

  it("videos", async () => {
    const orders = await orderingsOf(listVideos, (v) => v.id, "videos");
    expect(orders.size).toBe(1);
  });
});

describe("Q-014 · every ordered public read carries a unique final key", () => {
  // Source-level, because a tie cannot be forced for every table without
  // fabricating media and block rows. Stated as the limitation it is: this
  // asserts the CLAUSE, the tests above assert the BEHAVIOUR.
  it.each([
    ["services", /ORDER BY s\.sort_order, s\.created_at, s\.id/],
    ["testimonials", /ORDER BY sort_order, created_at, id/],
    ["gallery_images", /ORDER BY g\.sort_order, g\.created_at, g\.id/],
    ["jobs", /ORDER BY j\.sort_order, j\.created_at, j\.id/],
    ["content_list_items", /ORDER BY c\.collection, c\.sort_order, c\.created_at, c\.id/],
    ["content_block_items", /ORDER BY i\.group_key, i\.sort_order, i\.created_at, i\.id/],
    ["post blocks", /ORDER BY b\.sort_order, b\.created_at, b\.id/],
    ["posts (paginated)", /ORDER BY p\.published_at DESC, p\.id LIMIT/],
  ])("%s", (_label, pattern) => {
    expect(publicSource).toMatch(pattern);
  });

  it("🔴 no public read is left ordering on created_at alone", () => {
    // A clause ending `created_at` with no `id` after it is the defect.
    const bad = [...publicSource.matchAll(/ORDER BY [^`]*created_at(?![^`]*\bid\b)[^`]*`/g)];
    expect(bad.map((m) => m[0])).toEqual([]);
  });
});

describe("Q-014 · D-029's branch resolution now matches its documented algorithm", () => {
  it("the lead path orders by sort_order, created_at, id", () => {
    const src = readFileSync(
      resolve(ROOT, "src", "app", "api", "contact", "route.ts"),
      "utf8",
    );
    expect(src).toMatch(/ORDER BY sort_order, created_at, id LIMIT 1/);
  });

  it("and resolves the same branch hours on repeated reads", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const rows = await query<{ hours: unknown }>(
        `SELECT hours FROM branches
          WHERE hours IS NOT NULL AND is_active
          ORDER BY sort_order, created_at, id LIMIT 1`,
      );
      seen.add(JSON.stringify(rows[0]?.hours ?? null));
      await query("ANALYZE branches");
    }
    expect(seen.size).toBe(1);
  });
});

describe("Q-014 · the generated-content reads are all stable", () => {
  it("content blocks, lists, jobs, gallery, services and posts each read in one order", async () => {
    // These feed `src/content/*.ts`. One unstable read is one unreproducible
    // build, so they are checked together as the generator uses them.
    const checks: Array<[string, Set<string>]> = [
      ["services", await orderingsOf(listServices, (s) => s.slug, "services")],
      ["gallery", await orderingsOf(listGallery, (g) => g.src, "gallery_images")],
      ["jobs", await orderingsOf(listJobs, (j) => j.slug, "jobs")],
      [
        "contentBlocks",
        await orderingsOf(
          () => listContentBlocks(),
          (b) => `${b.page}.${b.slot}`,
          "content_blocks",
        ),
      ],
      [
        "contentLists",
        await orderingsOf(
          () => listContentLists(),
          (c) => `${c.collection}:${c.title ?? ""}`,
          "content_list_items",
        ),
      ],
      [
        "posts",
        await orderingsOf(
          async () => (await listPosts({ limit: 50, page: 1 })).items,
          (p) => p.slug,
          "blog_posts",
        ),
      ],
    ];

    for (const [label, orders] of checks) {
      expect(orders.size, `${label} produced ${String(orders.size)} orderings`).toBe(1);
    }
  });

  it("site settings — phones and branches keep their two independent orderings", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const s = await buildSiteSettings();
      seen.add(
        JSON.stringify({
          phones: s.phones.map((p) => p.branch),
          branches: s.branches.map((b) => b.name),
          socials: s.socials.map((x) => x.name),
        }),
      );
      await query("ANALYZE branches");
      await query("ANALYZE social_links");
    }
    expect(seen.size).toBe(1);
  });
});
