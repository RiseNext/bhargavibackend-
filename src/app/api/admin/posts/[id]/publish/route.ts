/**
 * POST /api/admin/posts/{id}/publish — `{ published: boolean }`.
 *
 * Separate from PATCH so publishing is an explicit, separately-audited action
 * rather than one field among many.
 */

import { postsCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const POST = postsCrud.publish;
