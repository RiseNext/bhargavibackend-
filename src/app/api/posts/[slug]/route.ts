/**
 * GET /api/posts/{slug} — public operation 16. Returns the post plus its blocks.
 */

import { resourceRoute } from "@/lib/public-read";
import { findPost } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = resourceRoute("GET /api/posts/{slug}", "posts", async (request) => {
  const slug = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const item = await findPost(slug);
  return { item, updatedAt: item?.updatedAt };
});
