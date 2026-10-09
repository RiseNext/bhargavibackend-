/** POST /reorder for stats — applied atomically in one statement. */

import { statsCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const POST = statsCrud.reorder;
