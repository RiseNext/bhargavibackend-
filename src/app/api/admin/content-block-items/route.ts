/**
 * GET  /api/admin/content-block-items — optionally filtered by `?blockId=`.
 * POST /api/admin/content-block-items — add one to a group.
 */

import { createBlockItem, listBlockItems } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const GET = listBlockItems;
export const POST = createBlockItem;
