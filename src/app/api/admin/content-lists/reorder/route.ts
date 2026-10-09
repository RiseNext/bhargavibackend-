/** POST /reorder for content-lists — applied atomically in one statement. */

import { contentListsCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const POST = contentListsCrud.reorder;
