/**
 * GET /api/testimonials — public operation 9. Supports `?featured=true`.
 *
 * 🔴 X-22: `rating` is NOT in the payload. TestimonialCard renders five
 * hardcoded stars independent of data, and `rating` is NULL on all 23 rows —
 * exposing it invites wiring the stars to it, which would strip them from
 * every card.
 */

import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listTestimonials } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/testimonials", "testimonials", async (request) => ({
  items: await listTestimonials(new URL(request.url).searchParams.get("featured") === "true"),
  updatedAt: await latestContentChange(),
}));
