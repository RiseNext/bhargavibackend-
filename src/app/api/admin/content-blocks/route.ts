/** GET /api/admin/content-blocks — the 41 rows, optionally filtered by `?page=`. */

import { listContentBlocksAdmin } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const GET = listContentBlocksAdmin;
