/**
 * POST /api/admin/services/{id}/images/reorder — `{ ids: string[] }`.
 *
 * Applied in ONE statement, scoped to this service, so the slider is never
 * visibly half-reordered and a sibling service's ids cannot be renumbered.
 */

import { reorderServiceImages } from "@/lib/admin/service-images";

export const dynamic = "force-dynamic";

export const POST = reorderServiceImages;
