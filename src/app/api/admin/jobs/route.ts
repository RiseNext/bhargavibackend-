/**
 * GET  /api/admin/jobs — list, paginated.
 * POST /api/admin/jobs — create.
 *
 * Both gates, CSRF on the mutation, a strict field allowlist, an audit row in
 * the same transaction, and a queued deploy hook all come from the CRUD factory
 * (lib/admin/crud.ts). Nothing publishes by default.
 */

import { jobsCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = jobsCrud.list;
export const POST = jobsCrud.create;
