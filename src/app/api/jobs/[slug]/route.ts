/**
 * GET /api/jobs/{slug} — public operation 14.
 */

import { resourceRoute } from "@/lib/public-read";
import { findJob } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = resourceRoute("GET /api/jobs/{slug}", "jobs", async (request) => {
  const slug = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const item = await findJob(slug);
  return { item, updatedAt: item?.updatedAt };
});
