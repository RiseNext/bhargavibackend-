/**
 * GET /api/videos — public operation 10. Supports `?featured=true`.
 *
 * Thumbnail and embed URLs are DERIVED from the id by code-owned helpers
 * (`youtubeThumb`, `youtubeWatch`), never stored and never sent.
 */

import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listVideos } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/videos", "videos", async (request) => ({
  items: await listVideos(new URL(request.url).searchParams.get("featured") === "true"),
  updatedAt: await latestContentChange(),
}));
