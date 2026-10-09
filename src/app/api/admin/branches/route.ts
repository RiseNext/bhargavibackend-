/**
 * GET  /api/admin/branches — list, with the ordering warning and D-029 provenance.
 * POST /api/admin/branches — create.
 *
 * 🚫 There is deliberately NO DELETE handler anywhere under branches (D-025 /
 * D-036): deleting a branch would orphan historical leads. `isActive` via PATCH
 * is the only way to hide one, and the route-tree test asserts the absence.
 */

import { createBranch, listBranches } from "@/lib/admin/branches";

export const dynamic = "force-dynamic";

export const GET = listBranches;
export const POST = createBranch;
