/** GET /api/admin/page-meta — all nine rows. */

import { listPageMetaAdmin } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const GET = listPageMetaAdmin;
