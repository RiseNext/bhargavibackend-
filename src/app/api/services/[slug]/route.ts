/**
 * GET /api/services/{slug} — public operation 8.
 */

import { resourceRoute } from "@/lib/public-read";
import { findService } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = resourceRoute("GET /api/services/{slug}", "services", async (request) => {
  const slug = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const item = await findService(slug);
  return { item, updatedAt: item?.updatedAt };
});
