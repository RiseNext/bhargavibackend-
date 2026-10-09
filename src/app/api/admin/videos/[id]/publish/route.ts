/**
 * POST /api/admin/videos/{id}/publish — `{ published: boolean }`.
 *
 * Separate from PATCH so publishing is an explicit, separately-audited action
 * rather than one field among many.
 */

import { videosCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const POST = videosCrud.publish;
