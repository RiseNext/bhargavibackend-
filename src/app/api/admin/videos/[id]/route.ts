/**
 * GET    /api/admin/videos/{id}
 * PATCH  /api/admin/videos/{id} — strict allowlist; mass assignment rejected.
 * DELETE /api/admin/videos/{id} — SOFT delete; content edits stay recoverable.
 *
 * 🔴 The slug of a published row cannot be changed — it is a live URL.
 */

import { videosCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = videosCrud.detail;
export const PATCH = videosCrud.update;
export const DELETE = videosCrud.remove;
