/** GET (list) and POST (create) for social-links. Handlers come from the verified CRUD factory. */

import { socialLinksCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = socialLinksCrud.list;
export const POST = socialLinksCrud.create;
