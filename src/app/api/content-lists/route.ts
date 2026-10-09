/**
 * GET /api/content-lists — public operation 19. Supports `?collection=`.
 *
 * Five collections in one table: whyChooseUs, process, philosophy,
 * achievements, aboutStory. ⚠ `philosophy` lives inside about/page.tsx in the
 * live frontend, not a content file — the easiest thing to miss on migration.
 */

import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listContentLists, type ContentCollection } from "@/lib/content/public";

export const dynamic = "force-dynamic";

const COLLECTIONS = new Set<ContentCollection>([
  "why_choose_us",
  "process",
  "philosophy",
  "achievements",
  "about_story",
]);

export const GET = collectionRoute("GET /api/content-lists", "content-lists", async (request) => {
  const requested = new URL(request.url).searchParams.get("collection");
  // An unknown filter returns everything rather than 400 — the generator asks
  // for all of them, and a typo should not fail a build.
  const collection =
    requested !== null && COLLECTIONS.has(requested as ContentCollection)
      ? (requested as ContentCollection)
      : undefined;

  return { items: await listContentLists(collection), updatedAt: await latestContentChange() };
});
