/**
 * GET  /api/admin/gallery — list, paginated.
 * POST /api/admin/gallery — create.
 *
 * Both gates, CSRF on the mutation, a strict field allowlist, an audit row in
 * the same transaction, and a queued deploy hook all come from the CRUD factory
 * (lib/admin/crud.ts). Nothing publishes by default.
 */

import { galleryCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = galleryCrud.list;
export const POST = galleryCrud.create;
