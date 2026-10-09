/** GET (list) and POST (create) for content-lists. Handlers come from the verified CRUD factory. */

import { contentListsCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = contentListsCrud.list;
export const POST = contentListsCrud.create;
