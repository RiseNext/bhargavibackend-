/**
 * GET    /api/admin/posts/{id}
 * PATCH  /api/admin/posts/{id} — strict allowlist; mass assignment rejected.
 * DELETE /api/admin/posts/{id} — SOFT delete; content edits stay recoverable.
 *
 * 🔴 The slug of a published row cannot be changed — it is a live URL.
 */

import { postsCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = postsCrud.detail;
export const PATCH = postsCrud.update;
export const DELETE = postsCrud.remove;
