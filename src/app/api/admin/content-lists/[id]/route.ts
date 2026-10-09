/**
 * GET, PATCH and DELETE for one content-lists row.
 *
 * `published` is a PATCH field here rather than its own endpoint — these three
 * collections have 6 operations, not 7 (blueprint section H.2, the "reduced"
 * group).
 */

import { contentListsCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = contentListsCrud.detail;
export const PATCH = contentListsCrud.update;
export const DELETE = contentListsCrud.remove;
