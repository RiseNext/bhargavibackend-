/**
 * GET   /api/admin/branches/{id}
 * PATCH /api/admin/branches/{id}
 *
 * The handlers existed in `lib/admin/branches.ts` from the start but this route
 * file did not, so both operations answered 404 and a branch was effectively
 * read-only. That matters more than a missing endpoint usually would: D-005 and
 * D-006 make the opening hours and the address admin-editable, and Bowenpally's
 * address, geo, maps and hours are all still NULL pending client input (D-029)
 * — this is the only route through which they can ever be filled in.
 *
 * ⚠ No DELETE, deliberately. D-025: a branch is deactivated via `is_active`,
 * never deleted, because `submissions.branch_id` references it and a lead must
 * not lose the branch it was made against.
 */

import { getBranch, updateBranch } from "@/lib/admin/branches";

export const dynamic = "force-dynamic";

export const GET = getBranch;
export const PATCH = updateBranch;
