/**
 * GET /api/page-meta — public operation 20.
 *
 * Nine rows, not eleven: `/services/[slug]` is a generated template whose
 * values live in `services.seo_*`, and `not-found` exports no metadata today.
 */

import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listPageMeta } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/page-meta", "page-meta", async () => ({
  items: await listPageMeta(),
  updatedAt: await latestContentChange(),
}));
