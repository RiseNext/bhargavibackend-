/** GET (list) and POST (create) for stats. Handlers come from the verified CRUD factory. */

import { statsCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = statsCrud.list;
export const POST = statsCrud.create;
