/**
 * GET /api/page-meta/{page} — public operation 21.
 */

import { resourceRoute } from "@/lib/public-read";
import { findPageMeta } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = resourceRoute("GET /api/page-meta/{page}", "page-meta", async (request) => {
  const page = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const item = await findPageMeta(page);
  return { item, updatedAt: item?.updatedAt };
});
