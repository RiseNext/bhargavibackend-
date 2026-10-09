/**
 * POST /api/admin/gallery/reorder — `{ ids: string[] }`.
 *
 * Applied in ONE statement so the reorder is atomic: N separate updates would
 * leave a visibly half-reordered list if one failed.
 */

import { galleryCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const POST = galleryCrud.reorder;
