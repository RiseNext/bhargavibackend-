/**
 * GET    /api/admin/jobs/{id}
 * PATCH  /api/admin/jobs/{id} — strict allowlist; mass assignment rejected.
 * DELETE /api/admin/jobs/{id} — SOFT delete; content edits stay recoverable.
 *
 * 🔴 The slug of a published row cannot be changed — it is a live URL.
 */

import { jobsCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = jobsCrud.detail;
export const PATCH = jobsCrud.update;
export const DELETE = jobsCrud.remove;
