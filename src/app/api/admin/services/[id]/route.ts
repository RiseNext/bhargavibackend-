/**
 * GET    /api/admin/services/{id}
 * PATCH  /api/admin/services/{id} — strict allowlist; mass assignment rejected.
 * DELETE /api/admin/services/{id} — SOFT delete; content edits stay recoverable.
 *
 * 🔴 The slug of a published row cannot be changed — it is a live URL.
 */

import { servicesCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = servicesCrud.detail;
export const PATCH = servicesCrud.update;
export const DELETE = servicesCrud.remove;
