/**
 * GET    /api/admin/gallery/{id}
 * PATCH  /api/admin/gallery/{id} — strict allowlist; mass assignment rejected.
 * DELETE /api/admin/gallery/{id} — SOFT delete; content edits stay recoverable.
 *
 * 🔴 The slug of a published row cannot be changed — it is a live URL.
 */

import { galleryCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = galleryCrud.detail;
export const PATCH = galleryCrud.update;
export const DELETE = galleryCrud.remove;
