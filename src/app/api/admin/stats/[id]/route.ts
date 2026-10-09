/**
 * GET, PATCH and DELETE for one stats row.
 *
 * `published` is a PATCH field here rather than its own endpoint — these three
 * collections have 6 operations, not 7 (blueprint section H.2, the "reduced"
 * group).
 */

import { statsCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = statsCrud.detail;
export const PATCH = statsCrud.update;
export const DELETE = statsCrud.remove;
