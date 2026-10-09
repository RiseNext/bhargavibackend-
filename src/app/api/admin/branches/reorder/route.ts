/**
 * POST /api/admin/branches/reorder
 *
 * 🔴 Takes `sortOrder` and `phoneSortOrder` as SEPARATE optional arrays. A
 * single array would be the D-013 trap itself — the caller would not know which
 * ordering it was setting, and the natural reading would silently move eight
 * rendered phone numbers across five surfaces.
 */

import { reorderBranches } from "@/lib/admin/branches";

export const dynamic = "force-dynamic";

export const POST = reorderBranches;
