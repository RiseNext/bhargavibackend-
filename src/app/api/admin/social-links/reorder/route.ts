/** POST /reorder for social-links — applied atomically in one statement. */

import { socialLinksCrud } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const POST = socialLinksCrud.reorder;
