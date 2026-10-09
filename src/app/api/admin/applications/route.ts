/**
 * GET /api/admin/applications — the applications list.
 *
 * Unlike submissions, `applications.message` ("Why you?") is **plaintext** and
 * IS returned: it is employment data that staff legitimately read and search,
 * not health data. Stated explicitly so nobody encrypts it by symmetry with
 * D-035, and so nobody strips it by symmetry either.
 *
 * The list exposes the four resume states (D-014 + D-031) so the admin can see
 * at a glance who still owes a CV, whose upload was rejected, and whose was
 * merely abandoned.
 */

import { requireAdmin } from "@/lib/auth/guard";
import { CACHE_NO_STORE, handle, paginated } from "@/lib/http";
import {
  listApplications,
  type ApplicationStatus,
  type ResumeMethod,
} from "@/lib/leads/applications";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;

const STATUSES = new Set<ApplicationStatus>([
  "new",
  "screening",
  "interviewed",
  "rejected",
  "hired",
]);
const METHODS = new Set<ResumeMethod>(["upload", "email"]);

export function GET(request: Request): Promise<Response> {
  return handle(
    "GET /api/admin/applications",
    async () => {
      await requireAdmin();

      const params = new URL(request.url).searchParams;
      const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit") ?? "50") || 50));

      const status = params.get("status");
      const method = params.get("resumeMethod");
      const q = params.get("q");

      const { rows, total } = await listApplications({
        ...(status && STATUSES.has(status as ApplicationStatus)
          ? { status: status as ApplicationStatus }
          : {}),
        ...(method && METHODS.has(method as ResumeMethod)
          ? { resumeMethod: method as ResumeMethod }
          : {}),
        ...(params.get("jobId") ? { jobId: params.get("jobId") as string } : {}),
        ...(q ? { q } : {}),
        limit,
        offset: (page - 1) * limit,
      });

      return paginated(rows, { total, page, limit }, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );
}
