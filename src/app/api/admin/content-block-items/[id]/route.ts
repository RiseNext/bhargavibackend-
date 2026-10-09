/**
 * PUT    /api/admin/content-block-items/{id} — replaces the item.
 * DELETE /api/admin/content-block-items/{id}
 */

import { deleteBlockItem, putBlockItem } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const PUT = putBlockItem;
export const DELETE = deleteBlockItem;
