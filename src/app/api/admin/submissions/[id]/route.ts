/**
 * GET   /api/admin/submissions/{id} — the detail view. **Decrypts the message.**
 * PATCH /api/admin/submissions/{id} — status and internal notes only.
 *
 * 🔐 D-035: the GET writes an `audit_log` row with `action = 'view_message'`
 * whenever it actually decrypts one. Reading a patient's health complaint is a
 * disclosure event, and the audit trail is what makes it accountable.
 *
 * The audit row is written only when a decryption really occurred — auditing a
 * disclosure that did not happen would make the trail useless for answering
 * "who has read this person's symptoms?".
 *
 * ⚠ Only `status` and `adminNotes` are patchable. A lead's identity fields are
 * what the visitor submitted; an admin editing them would destroy the record's
 * evidential value, and mass assignment is how that happens by accident.
 */

import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireAdmin, requireAdminMutation } from "@/lib/auth/guard";
import { invalidJson, notFound, unprocessable } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, readJsonBody, respond } from "@/lib/http";
import { findSubmissionById, updateSubmission } from "@/lib/leads/submissions";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idFrom(request: Request): string {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  // A malformed id is a 404, not a 500 from the driver and not a 400 that
  // confirms the route exists.
  if (!UUID.test(id)) throw notFound();
  return id;
}

export function GET(request: Request): Promise<Response> {
  return handle(
    "GET /api/admin/submissions/{id}",
    async () => {
      const session = await requireAdmin();
      const id = idFrom(request);

      const found = await findSubmissionById(id);
      if (!found) throw notFound();

      if (found.decrypted) {
        // 🔐 The disclosure record. Written before the response so a crash
        // cannot produce an unaudited read.
        await audit({
          actorId: session.user.id,
          action: "view_message",
          entityType: "submissions",
          entityId: id,
          // The reference identifies the row; the message itself must never
          // reach the audit diff (§36), and `redactDiff` would strip it anyway.
          diff: { reference: found.row.reference },
          ip: clientIp(request),
          userAgent: request.headers.get("user-agent") ?? undefined,
        });
      }

      return respond(found.row, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );
}

/** A strict allowlist. Anything else in the body is ignored, not applied. */
const patchSchema = z
  .object({
    status: z.enum(["new", "contacted", "closed"]).optional(),
    adminNotes: z.string().max(5000).nullable().optional(),
  })
  .strict();

export function PATCH(request: Request): Promise<Response> {
  return handle(
    "PATCH /api/admin/submissions/{id}",
    async () => {
      const session = await requireAdminMutation(request);
      const id = idFrom(request);

      const body = await readJsonBody(request);
      if (body.kind !== "ok") throw invalidJson();

      const parsed = patchSchema.safeParse(body.value);
      if (!parsed.success) {
        // `.strict()` means an unexpected key is rejected rather than silently
        // dropped — so an attempt to patch `name` or `phone` fails loudly.
        throw unprocessable("Only status and adminNotes can be changed.");
      }
      if (parsed.data.status === undefined && parsed.data.adminNotes === undefined) {
        throw unprocessable("Nothing to change.");
      }

      const before = await findSubmissionById(id);
      if (!before) throw notFound();

      const updated = await updateSubmission(id, parsed.data);
      if (!updated) throw notFound();

      await audit({
        actorId: session.user.id,
        action: "update",
        entityType: "submissions",
        entityId: id,
        diff: {
          reference: updated.reference,
          ...(parsed.data.status !== undefined
            ? { status: { from: before.row.status, to: parsed.data.status } }
            : {}),
          // The note's TEXT is not recorded — it is staff-authored and may quote
          // the patient. That it changed is enough.
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
