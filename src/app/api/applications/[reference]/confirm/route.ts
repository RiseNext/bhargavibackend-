/**
 * POST /api/applications/{reference}/confirm — verify the uploaded CV, then
 * attach it (D-031, as corrected by D-039).
 *
 * 🔴 THIS IS WHERE EVERY GUARANTEE IS ACTUALLY ENFORCED. Under D-014 the file
 * never passed through this backend, and Cloudinary enforces neither the size
 * limit (D-039 C-1) nor — without `allowed_formats` — the content type. So at
 * this point the file exists, at whatever size, with whatever bytes.
 *
 * The checks run cheapest-first (`verifyResumeAsset`):
 *   public_id matches what WE authorised → asset exists → resource_type and
 *   delivery type are raw/authenticated → declared format allowlisted →
 *   bytes ≤ 5 MB → magic bytes agree with the declared format.
 *
 * 🔴 EVERY failure path DESTROYS the asset and records WHY. An invalid upload
 * left in place would be an orphan no row references, sitting in the clinic's
 * account, containing a stranger's file. The rejection reason is one of the
 * seven the schema permits, so the admin can tell a rename attempt from an
 * abandoned upload and knows whether to chase the applicant.
 *
 * Idempotent: confirming twice returns the same success rather than a second
 * media row.
 */

import { conflict, notFound, rateLimited, unavailable, unprocessable } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, respond } from "@/lib/http";
import { logger } from "@/lib/logger";
import { LIMITS, consume } from "@/lib/ratelimit";
import { query, queryOne } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isCloudinaryConfigured } from "@/lib/cloudinary/client";
import {
  destroyAsset,
  fetchResource,
  verifyResumeAsset,
  type RejectionReason,
} from "@/lib/cloudinary/upload";
import { insertMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

const REFERENCE = /^BHW-\d{4}-\d{4,}$/;

function referenceFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/");
  const ref = decodeURIComponent(parts[parts.length - 2] ?? "").toUpperCase();
  if (!REFERENCE.test(ref)) throw notFound();
  return ref;
}

export function POST(request: Request): Promise<Response> {
  return handle("POST /api/applications/{reference}/confirm", async () => {
    const ip = clientIp(request);

    // Fails closed, same reasoning as upload-signature (X-33).
    const limit = await consume(`resume:confirm:${ip ?? "unknown"}`, LIMITS.referenceLookup);
    if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);

    if (!isCloudinaryConfigured()) throw unavailable("Resume upload is not available.");

    const reference = referenceFrom(request);

    const row = await queryOne<{
      id: string;
      resume_public_id: string | null;
      confirmed: boolean;
      rejected: boolean;
      media_id: string | null;
    }>(
      `SELECT id::text AS id, resume_public_id,
              resume_confirmed_at IS NOT NULL AS confirmed,
              resume_upload_rejected_at IS NOT NULL AS rejected,
              resume_media_id::text AS media_id
         FROM applications WHERE reference = $1`,
      [reference],
    );

    if (!row) throw notFound();
    if (row.rejected) throw conflict("That upload was rejected. Please contact the clinic.");

    // Idempotent: a retried confirm is a success, not a duplicate row.
    if (row.confirmed) {
      return respond({ ok: true, confirmed: true }, { cache: CACHE_NO_STORE });
    }

    // 🔴 The id to verify comes from OUR row, never from the request body.
    // This is what makes a guessed reference useless: the caller cannot choose
    // which asset gets attached to an application.
    const expected = row.resume_public_id;
    if (expected === null) {
      throw conflict("No upload has been authorised for that application.");
    }

    const verdict = await verifyResumeAsset({ publicId: expected, expectedPublicId: expected });

    if (!verdict.ok) {
      const reason: RejectionReason = verdict.reason ?? "fetch_failed";

      // 🔴 Destroy first, then record. If `not_found` the asset never existed,
      // so there is nothing to destroy and nothing to leak.
      const destroyed =
        reason === "not_found"
          ? false
          : await destroyAsset({
              publicId: expected,
              resourceType: "raw",
              deliveryType: "authenticated",
            });

      await query(
        `UPDATE applications
            SET resume_upload_rejected_at = now(),
                resume_rejection_reason = $2,
                updated_at = now()
          WHERE id = $1`,
        [row.id, reason],
      );

      // 🔴 `detail` only — never the file, never its bytes.
      logger().warn("resume.confirm_rejected", {
        reference,
        reason,
        detail: verdict.detail,
        destroyed,
      });

      throw unprocessable(`That file could not be accepted (${reason}).`, { destroyed });
    }

    // Re-read the metadata for the row. `verifyResumeAsset` already fetched it,
    // but passing it back would couple the verifier's shape to the writer's.
    const resource = await fetchResource({
      publicId: expected,
      resourceType: "raw",
      deliveryType: "authenticated",
    });
    if (resource === null) throw unprocessable("That upload is no longer available.");

    const media = await insertMedia({
      publicId: expected,
      resourceType: "raw",
      deliveryType: "authenticated",
      // 🔴 private ⇒ the DB CHECK forbids storing a secure_url for it.
      visibility: "private",
      format: verdict.format ?? "pdf",
      resource,
      folder: "resumes",
    });

    await query(
      `UPDATE applications
          SET resume_media_id = $2,
              resume_confirmed_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [row.id, media.id],
    );

    await audit({
      action: "create",
      entityType: "applications",
      entityId: row.id,
      diff: { reference, resumeConfirmed: true, mediaId: media.id, format: verdict.format },
      ip,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    logger().info("resume.confirmed", { reference, format: verdict.format });

    // 🔴 Nothing about the asset is returned — no URL, no public_id. The
    // applicant does not need it and a private handle should not travel.
    return respond({ ok: true, confirmed: true }, { cache: CACHE_NO_STORE });
  });
}
