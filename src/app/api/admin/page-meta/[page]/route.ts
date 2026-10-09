/**
 * GET /api/admin/page-meta/{page}
 * PUT /api/admin/page-meta/{page}
 *
 * A keyed singleton: rows come from the seed, one per real page. Setting
 * `noindex` returns an explicit warning, because it removes the page from
 * search results.
 */

import { getPageMetaAdmin, putPageMetaAdmin } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const GET = getPageMetaAdmin;
export const PUT = putPageMetaAdmin;
