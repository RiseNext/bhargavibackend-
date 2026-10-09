/**
 * POST /api/admin/media/signature — authorise one admin image upload (D-014).
 *
 * The browser gets signed parameters and uploads STRAIGHT to Cloudinary; the
 * file never passes through this backend. 🔴 The API secret is used to compute
 * the signature here and never leaves the server.
 *
 * 🔴 No `max_bytes`. Cloudinary neither signs nor enforces it (D-039 C-1), so
 * sending it would be theatre: it breaks the signature when signed and does
 * nothing when unsigned. The size limit is enforced at `/confirm`, which
 * destroys an oversized asset.
 *
 * The caller chooses only a folder and a filename hint. `public_id`,
 * `allowed_formats` and the delivery type are decided HERE — a client that
 * could choose its own `allowed_formats` could upload anything.
 */

import { z } from "zod";
import { requireAdminMutation } from "@/lib/auth/guard";
import { badRequest } from "@/lib/errors";
import { CACHE_NO_STORE, handle, readJsonBody, respond } from "@/lib/http";
import { ALLOWED_IMAGE_FORMATS, MAX_BYTES, buildSignedUpload } from "@/lib/cloudinary/upload";
import { isCloudinaryConfigured } from "@/lib/cloudinary/client";
import { unavailable } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Folders an administrator may upload into. Not free text. */
const FOLDERS = ["services", "gallery", "icons", "brand", "blog"] as const;

const Body = z
  .object({
    folder: z.enum(FOLDERS),
    /** Used only to derive a slug; never trusted as a path. */
    filename: z.string().trim().min(1).max(160),
  })
  .strict();

/**
 * `bhw/dev` or `bhw/prod`, matching `scripts/migrate-assets.ts`.
 *
 * Derived from NODE_ENV rather than a new environment variable, so dev uploads
 * cannot land among production assets and no second source of truth exists.
 */
function rootPrefix(): string {
  return process.env.NODE_ENV === "production" ? "bhw/prod" : "bhw/dev";
}

/**
 * A collision-resistant, path-safe `public_id`.
 *
 * The filename contributes a readable stem only. 🔴 Any `/`, `..` or control
 * character is stripped rather than escaped — an id is a path on Cloudinary,
 * and a caller-controlled path is a way to overwrite someone else's asset.
 */
function publicIdFor(folder: string, filename: string): string {
  const stem = filename
    .replace(/\.[A-Za-z0-9]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return `${rootPrefix()}/${folder}/${stem === "" ? "upload" : stem}-${suffix}`;
}

export function POST(request: Request): Promise<Response> {
  return handle("POST /api/admin/media/signature", async () => {
    await requireAdminMutation(request);

    if (!isCloudinaryConfigured()) throw unavailable("Media storage is not configured.");

    const body = await readJsonBody(request);
    if (body.kind !== "ok") throw badRequest("Invalid JSON body.");

    const parsed = Body.safeParse(body.value);
    if (!parsed.success) throw badRequest("folder and filename are required.");

    const publicId = publicIdFor(parsed.data.folder, parsed.data.filename);

    const signed = buildSignedUpload({
      publicId,
      resourceType: "image",
      allowedFormats: ALLOWED_IMAGE_FORMATS,
      deliveryType: "upload",
    });

    return respond(
      {
        uploadUrl: signed.url,
        fields: signed.fields,
        publicId,
        // Advisory only — the browser can show a friendly error before
        // uploading. 🔴 Enforcement is at /confirm, never here.
        maxBytes: MAX_BYTES.image,
        allowedFormats: ALLOWED_IMAGE_FORMATS,
      },
      { admin: true, cache: CACHE_NO_STORE },
    );
  });
}
