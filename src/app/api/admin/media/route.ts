/**
 * GET /api/admin/media — the media library.
 *
 * Private assets ARE listed: an administrator has to be able to see that a
 * resume exists and when it arrived. 🔴 They carry no URL — `secure_url` is
 * NULL for them by database CHECK, and retrieval goes through the audited
 * signed-url endpoint instead. Listing a private asset is not disclosing it.
 */

import { requireAdmin } from "@/lib/auth/guard";
import { CACHE_NO_STORE, handle, paginated } from "@/lib/http";
import { listMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;

export function GET(request: Request): Promise<Response> {
  return handle("GET /api/admin/media", async () => {
    await requireAdmin();

    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit") ?? "50") || 50));

    const visibility = params.get("visibility");
    const resourceType = params.get("resourceType");

    const { rows, total } = await listMedia({
      limit,
      offset: (page - 1) * limit,
      ...(visibility === "public" || visibility === "private" ? { visibility } : {}),
      ...(resourceType === "image" || resourceType === "raw" ? { resourceType } : {}),
    });

    return paginated(rows, { page, limit, total }, { admin: true, cache: CACHE_NO_STORE });
  });
}
