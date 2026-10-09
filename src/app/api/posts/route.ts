/**
 * GET /api/posts — public operation 15. Paginated: `?page&limit&tag`.
 *
 * Only `published` posts with a `published_at` in the past. A draft must never
 * be publicly reachable.
 */

import { handle, paginated } from "@/lib/http";
import { guardPublicRead, publicReadHeaders } from "@/lib/public-read";
import { listPosts } from "@/lib/content/public";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;

export function GET(request: Request): Promise<Response> {
  return handle("GET /api/posts", async () => {
    await guardPublicRead(request, "posts");

    const params = new URL(request.url).searchParams;
    // Clamped rather than rejected: a bad page number should not fail a build.
    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit") ?? "10") || 10));
    const tag = params.get("tag") ?? undefined;

    const result = await listPosts({ page, limit, ...(tag ? { tag } : {}) });

    return paginated(
      result.items,
      { total: result.total, page: result.page, limit: result.limit },
      { headers: publicReadHeaders() },
    );
  });
}
