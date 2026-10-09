/**
 * POST /api/admin/videos/reorder — `{ ids: string[] }`.
 *
 * Applied in ONE statement so the reorder is atomic: N separate updates would
 * leave a visibly half-reordered list if one failed.
 */

import { videosCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const POST = videosCrud.reorder;
