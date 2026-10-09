/**
 * GET /api/admin/content-blocks/{page}/{slot}
 * PUT /api/admin/content-blocks/{page}/{slot}
 *
 * 🔴 No POST and no DELETE, deliberately. Slots are created by the seed, which
 * derives them from the immutable snapshot (D-037): inventing a slot the
 * frontend does not render would produce invisible content, and deleting one
 * would blank a live section.
 *
 * `extra` is validated against the per-slot allowlist on write (D-024).
 */

import { getContentBlockAdmin, putContentBlockAdmin } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const GET = getContentBlockAdmin;
export const PUT = putContentBlockAdmin;
