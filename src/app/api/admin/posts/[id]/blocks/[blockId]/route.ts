/**
 * PATCH  /api/admin/posts/{id}/blocks/{blockId} — replaces the block.
 * DELETE /api/admin/posts/{id}/blocks/{blockId} — hard delete.
 *
 * PATCH replaces rather than merges, because which fields are meaningful
 * depends on `type`: merging a partial `image` body onto a `text` block would
 * produce a row that satisfies neither.
 */

import { deleteBlock, updateBlock } from "@/lib/admin/blog-blocks";

export const dynamic = "force-dynamic";

export const PATCH = updateBlock;
export const DELETE = deleteBlock;
