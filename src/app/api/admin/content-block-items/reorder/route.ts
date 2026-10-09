/** POST /api/admin/content-block-items/reorder — applied atomically. */

import { reorderBlockItems } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const POST = reorderBlockItems;
