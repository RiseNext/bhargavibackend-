/**
 * GET /api/gallery — public operation 11.
 *
 * `gallery_images.alt` wins over `media.alt_default`: the per-use alt
 * describes this placement, the media default is only a fallback.
 */

import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listGallery } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/gallery", "gallery", async () => ({
  items: await listGallery(),
  updatedAt: await latestContentChange(),
}));
