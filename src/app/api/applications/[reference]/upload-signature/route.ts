/**
 * POST /api/applications/{reference}/upload-signature — authorise ONE resume
 * upload (D-014).
 *
 * 🔴 X-33 — A REFERENCE IS NOT AN AUTHORISATION TOKEN. References are quoted
 * over the phone and are sequential by design (`BHW-2026-0001`), so they are
 * guessable. This endpoint is therefore built so that guessing one buys an
 * attacker nothing useful:
 *
 *   · it only ever authorises an upload INTO a `public_id` the server chooses,
 *     so a guesser cannot overwrite or read anyone else's resume;
 *   · it returns nothing about the application — not the applicant's name, not
 *     their phone, not the role — so it cannot be used to enumerate applicants;
 *   · it refuses once an upload has already been authorised, confirmed or
 *     rejected, so a guesser cannot invalidate a real applicant's CV;
 *   · it is rate-limited by `referenceLookup`, which FAILS CLOSED.
 *
 * 🔴 No `max_bytes` — Cloudinary neither signs nor enforces it (D-039 C-1).
 * `/confirm` enforces 5 MB and destroys anything larger.
 *
 * 🔴 `allowed_formats` IS sent and signed, and that is load-bearing: verified,
 * Cloudinary rejects EXE bytes named `.pdf` when it is present and ACCEPTS them
 * when it is absent.
 */

import { z } from "zod";
import { requireAdmin as _unusedRequireAdmin } from "@/lib/auth/guard";
import { badRequest, conflict, notFound, rateLimited, unavailable } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, readJsonBody, respond } from "@/lib/http";
import { logger } from "@/lib/logger";
import { LIMITS, consume } from "@/lib/ratelimit";
import { query, queryOne } from "@/lib/db";
import { isCloudinaryConfigured } from "@/lib/cloudinary/client";
import { ALLOWED_RESUME_FORMATS, MAX_BYTES, buildSignedUpload } from "@/lib/cloudinary/upload";

export const dynamic = "force-dynamic";

void _unusedRequireAdmin;

/** 🔴 Public endpoint — no session, and it must never acquire one. */
const REFERENCE = /^BHW-\d{4}-\d{4,}$/;

type ResumeFormat = (typeof ALLOWED_RESUME_FORMATS)[number];

/** The only field a caller supplies, and it is an allowlist, not free text. */
const Body = z
  .object({ format: z.enum(ALLOWED_RESUME_FORMATS) })
  .strict();

function referenceFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/");
  const ref = decodeURIComponent(parts[parts.length - 2] ?? "").toUpperCase();
  if (!REFERENCE.test(ref)) throw notFound();
  return ref;
}

/**
 * 🔴 The id MUST carry the file extension.
 *
 * Cloudinary reports no `format` for `resource_type=raw` (D-039 C-2), so
 * `declaredFormat()` can only read it from the `public_id`. This function
 * produced an EXTENSIONLESS id, so `verifyResumeAsset` resolved the format to
 * `null`, rejected every upload as `format_mismatch` and DESTROYED it — and
 * because one signature is issued per application, the applicant was then
 * permanently locked out. Every genuine CV was lost.
 *
 * The extension is still only a CLAIM about the content. It is appended here
 * solely so Cloudinary has somewhere to report it from; `verifyResumeAsset`
 * then reads the first bytes and requires them to agree, so a `.pdf` containing
 * a ZIP or an EXE is still refused and destroyed.
 */
function publicIdFor(reference: string, format: ResumeFormat): string {
  const root = process.env.NODE_ENV === "production" ? "bhw/prod" : "bhw/dev";
  // The random suffix is what makes the id unguessable even though the
  // reference is not. Resumes live under their own folder so the admin-image
  // confirm endpoint can refuse anything from it.
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `${root}/resumes/${reference.toLowerCase()}-${suffix}.${format}`;
}

export function POST(request: Request): Promise<Response> {
  return handle("POST /api/applications/{reference}/upload-signature", async () => {
    const ip = clientIp(request);

    // 🔴 FAILS CLOSED. Unlike submissions, refusing here costs one upload
    // attempt, while allowing unlimited attempts turns a guessable reference
    // into an enumeration oracle.
    const limit = await consume(`resume:sig:${ip ?? "unknown"}`, LIMITS.referenceLookup);
    if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);

    if (!isCloudinaryConfigured()) throw unavailable("Resume upload is not available.");

    const reference = referenceFrom(request);

    /**
     * The applicant declares which of the three permitted formats they are
     * sending, because the extension has to be baked into the server-chosen
     * `public_id` before the upload happens.
     *
     * 🔴 It is validated against the allowlist and NEVER trusted as evidence of
     * the file's real type — `/confirm` reads the magic bytes and requires them
     * to match. A caller who declares `pdf` and uploads an EXE gets the asset
     * destroyed, exactly as before.
     */
    const body = await readJsonBody(request);
    if (body.kind === "too_large") throw badRequest("Request body too large.");
    if (body.kind !== "ok") throw badRequest("Invalid JSON body.");

    const parsed = Body.safeParse(body.value);
    if (!parsed.success) {
      throw badRequest(
        `format is required and must be one of: ${ALLOWED_RESUME_FORMATS.join(", ")}.`,
      );
    }
    const { format } = parsed.data;

    const row = await queryOne<{
      id: string;
      resume_method: "upload" | "email";
      authorised: boolean;
      confirmed: boolean;
      rejected: boolean;
    }>(
      `SELECT id::text AS id, resume_method,
              resume_upload_authorised_at IS NOT NULL AS authorised,
              resume_confirmed_at IS NOT NULL AS confirmed,
              resume_upload_rejected_at IS NOT NULL AS rejected
         FROM applications WHERE reference = $1`,
      [reference],
    );

    // 🔴 Identical shape for "no such application" and a bad reference: a
    // distinguishable 404 would confirm which references exist.
    if (!row) throw notFound();

    if (row.resume_method !== "upload") {
      throw conflict("That application is not using the upload workflow.");
    }
    if (row.confirmed) throw conflict("A CV has already been received.");
    if (row.rejected) throw conflict("That upload was rejected. Please contact the clinic.");
    if (row.authorised) {
      // One signature per application. Re-issuing would let a guesser replace
      // a real applicant's pending upload.
      throw conflict("An upload has already been authorised for that application.");
    }

    const publicId = publicIdFor(reference, format);

    const signed = buildSignedUpload({
      publicId,
      resourceType: "raw",
      allowedFormats: ALLOWED_RESUME_FORMATS,
      deliveryType: "authenticated",
    });

    // Recorded so /confirm can require THIS id, and so the admin can tell an
    // abandoned upload from one that was never started.
    await query(
      `UPDATE applications
          SET resume_upload_authorised_at = now(),
              resume_public_id = $2,
              updated_at = now()
        WHERE id = $1`,
      [row.id, publicId],
    );

    logger().info("resume.upload_authorised", { reference });

    return respond(
      {
        uploadUrl: signed.url,
        fields: signed.fields,
        publicId,
        maxBytes: MAX_BYTES.resume,
        allowedFormats: ALLOWED_RESUME_FORMATS,
      },
      { cache: CACHE_NO_STORE },
    );
  });
}
