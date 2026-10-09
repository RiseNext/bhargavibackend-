/**
 * GET    /api/admin/testimonials/{id}
 * PATCH  /api/admin/testimonials/{id} — strict allowlist; mass assignment rejected.
 * DELETE /api/admin/testimonials/{id} — SOFT delete; content edits stay recoverable.
 *
 * 🔴 The slug of a published row cannot be changed — it is a live URL.
 */

import { testimonialsCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = testimonialsCrud.detail;
export const PATCH = testimonialsCrud.update;
export const DELETE = testimonialsCrud.remove;
