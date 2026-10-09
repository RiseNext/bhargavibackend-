/**
 * POST /api/admin/posts/{id}/blocks/reorder
 *
 * Scoped to the post, so a block id belonging to another post cannot be moved
 * into this one by a crafted request.
 */

import { reorderBlocks } from "@/lib/admin/blog-blocks";

export const dynamic = "force-dynamic";

export const POST = reorderBlocks;
