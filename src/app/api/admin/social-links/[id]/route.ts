/**
 * GET, PATCH and DELETE for one social-links row.
 *
 * `published` is a PATCH field here rather than its own endpoint — these three
 * collections have 6 operations, not 7 (blueprint section H.2, the "reduced"
 * group).
 */

import { socialLinksCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = socialLinksCrud.detail;
export const PATCH = socialLinksCrud.update;
export const DELETE = socialLinksCrud.remove;
