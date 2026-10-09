/**
 * GET    /api/admin/faqs/{id}
 * PATCH  /api/admin/faqs/{id} — strict allowlist; mass assignment rejected.
 * DELETE /api/admin/faqs/{id} — SOFT delete; content edits stay recoverable.
 *
 * 🔴 The slug of a published row cannot be changed — it is a live URL.
 */

import { faqsCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = faqsCrud.detail;
export const PATCH = faqsCrud.update;
export const DELETE = faqsCrud.remove;
