/**
 * GET /api/faqs — public operation 12.
 *
 * Answers are PLAIN TEXT, enforced at the storage boundary, because they are
 * serialised into FAQPage JSON-LD where markup would be invalid.
 */

import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listFaqs } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/faqs", "faqs", async () => ({
  items: await listFaqs(),
  updatedAt: await latestContentChange(),
}));
