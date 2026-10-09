/**
 * GET   /api/admin/applications/{id}
 * PATCH /api/admin/applications/{id} — status, notes, and the emailed-CV
 *                                      received-at marker.
 *
 * `resumeReceivedAt` is the admin-set field that closes the D-008 email loop:
 * an applicant quotes their reference, the CV arrives in the clinic's inbox, and
 * marking it here is what turns "awaiting email" into "received".
 */

import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireAdmin, requireAdminMutation } from "@/lib/auth/guard";
import { invalidJson, notFound, unprocessable } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, readJsonBody, respond } from "@/lib/http";
import { findApplicationById, updateApplication } from "@/lib/leads/applications";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idFrom(request: Request): string {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  if (!UUID.test(id)) throw notFound();
  return id;
}

export function GET(request: Request): Promise<Response> {
  return handle(
    "GET /api/admin/applications/{id}",
    async () => {
      await requireAdmin();

      const row = await findApplicationById(idFrom(request));
      if (!row) throw notFound();

      return respond(row, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );
}

const patchSchema = z
  .object({
    status: z.enum(["new", "screening", "interviewed", "rejected", "hired"]).optional(),
    adminNotes: z.string().max(5000).nullable().optional(),
    /** ISO date, or null to clear. Set when an emailed CV arrives. */
    resumeReceivedAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export function PATCH(request: Request): Promise<Response> {
  return handle(
    "PATCH /api/admin/applications/{id}",
    async () => {
      const session = await requireAdminMutation(request);
      const id = idFrom(request);

      const body = await readJsonBody(request);
      if (body.kind !== "ok") throw invalidJson();

      const parsed = patchSchema.safeParse(body.value);
      if (!parsed.success) {
        throw unprocessable("Only status, adminNotes and resumeReceivedAt can be changed.");
      }

      const before = await findApplicationById(id);
      if (!before) throw notFound();

      const changes = {
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.adminNotes !== undefined ? { adminNotes: parsed.data.adminNotes } : {}),
        ...(parsed.data.resumeReceivedAt !== undefined
          ? {
              resumeReceivedAt:
                parsed.data.resumeReceivedAt === null
                  ? null
                  : new Date(parsed.data.resumeReceivedAt),
            }
          : {}),
      };

      if (Object.keys(changes).length === 0) throw unprocessable("Nothing to change.");

      const updated = await updateApplication(id, changes);
      if (!updated) throw notFound();

      await audit({
        actorId: session.user.id,
        action: "update",
        entityType: "applications",
        entityId: id,
        diff: {
          reference: updated.reference,
          ...(parsed.data.status !== undefined
            ? { status: { from: before.status, to: parsed.data.status } }
            : {}),
          ...(parsed.data.resumeReceivedAt !== undefined
            ? { resumeReceivedAt: parsed.data.resumeReceivedAt }
            : {}),
          ...(parsed.data.adminNotes !== undefined ? { adminNotesChanged: true } : {}),
        },
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined,
      });

      return respond(updated, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );
}
