/**
 * GET /api/admin/audit — the audit trail.
 *
 * Append-only: there is no POST, PATCH or DELETE, and the table enforces that
 * with a trigger rather than relying on a grant an owner role would ignore.
 *
 * The trail's whole value is answering "who read this patient's symptoms, and
 * when?" — so `view_message`, `resume_download` and `export` are filterable
 * first-class actions here, not buried among ordinary updates.
 */

import { requireAdmin } from "@/lib/auth/guard";
import { listAudit, type AuditAction } from "@/lib/audit";
import { CACHE_NO_STORE, handle, paginated } from "@/lib/http";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;

const ACTIONS = new Set<AuditAction>([
  "create",
  "update",
  "delete",
  "publish",
  "unpublish",
  "reorder",
  "login",
  "login_failed",
  "logout",
  "password_change",
  "export",
  "resume_download",
  "view_message",
  "deploy_hook",
  "seed",
  "purge",
]);

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function GET(request: Request): Promise<Response> {
  return handle(
    "GET /api/admin/audit",
    async () => {
      await requireAdmin();

      const params = new URL(request.url).searchParams;
      const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit") ?? "50") || 50));

      const action = params.get("action");
      const from = parseDate(params.get("from"));
      const to = parseDate(params.get("to"));

      const { rows, total } = await listAudit({
        ...(params.get("actorId") ? { actorId: params.get("actorId") as string } : {}),
        ...(params.get("entityType") ? { entityType: params.get("entityType") as string } : {}),
        ...(action && ACTIONS.has(action as AuditAction) ? { action: action as AuditAction } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        limit,
        offset: (page - 1) * limit,
      });

      return paginated(rows, { total, page, limit }, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );
}
