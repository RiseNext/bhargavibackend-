/**
 * GET /api/content-blocks — public operation 18. Supports `?page=`.
 *
 * Returns `extra` and the repeating `items[]` groups (D-024). The seeded row
 * set is incomplete until seed stage S3, which is gated on 0.12.
 */

import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listContentBlocks } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/content-blocks", "content-blocks", async (request) => ({
  items: await listContentBlocks(new URL(request.url).searchParams.get("page") ?? undefined),
  updatedAt: await latestContentChange(),
}));
