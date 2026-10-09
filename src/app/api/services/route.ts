/**
 * GET /api/services — public operation 7.
 *
 * Feeds the generator's `content/services.ts`. `copyStatus` is deliberately
 * absent from the payload: it has zero frontend consumers and is editorial
 * state that should never be publicly visible.
 */

import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listServices } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/services", "services", async () => ({
  items: await listServices(),
  updatedAt: await latestContentChange(),
}));
