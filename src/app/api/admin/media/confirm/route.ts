/**
 * POST /api/admin/media/confirm — verify an uploaded image, then record it.
 *
 * 🔴 THIS IS THE ENFORCEMENT POINT. Cloudinary does not enforce `max_bytes`
 * (D-039 C-1), so by the time this runs the file already exists at whatever
 * size the uploader chose. Every rejection therefore DESTROYS the asset: a
 * rejected upload that stays in the account is both a storage cost nobody
 * authorised and an orphan no database row references.
 *
 * Order: cheap metadata checks first, so a wrong `public_id` never costs more
 * than one Admin API call.
 *
 * Images are `resource_type=image`, which Cloudinary genuinely decodes — so
 * `format`, `width` and `height` coming back populated IS a content check.
 * That is why images need no magic-byte read, and resumes (`raw`) do.
 */

import { z } from "zod";
import { requireAdminMutation } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { badRequest, unavailable, unprocessable } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, readJsonBody, respond } from "@/lib/http";
import { logger } from "@/lib/logger";
import { isCloudinaryConfigured } from "@/lib/cloudinary/client";
import {
  ALLOWED_IMAGE_FORMATS,
  MAX_BYTES,
  destroyAsset,
  fetchResource,
} from "@/lib/cloudinary/upload";
import { insertMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    publicId: z.string().trim().min(1).max(300),
    altDefault: z.string().trim().max(300).optional(),
  })
  .strict();

export function POST(request: Request): Promise<Response> {
  return handle("POST /api/admin/media/confirm", async () => {
    const session = await requireAdminMutation(request);

    if (!isCloudinaryConfigured()) throw unavailable("Media storage is not configured.");

    const body = await readJsonBody(request);
    if (body.kind !== "ok") throw badRequest("Invalid JSON body.");

    const parsed = Body.safeParse(body.value);
    if (!parsed.success) throw badRequest("publicId is required.");
    const { publicId, altDefault } = parsed.data;

    // 🔴 The id must be one we issued. Without this an administrator could
    // "confirm" — and thereby publish — any asset in the account, including a
    // resume, by naming its public_id.
    const expectedPrefix = process.env.NODE_ENV === "production" ? "bhw/prod/" : "bhw/dev/";
    if (!publicId.startsWith(expectedPrefix) || publicId.includes("/resumes/")) {
      throw unprocessable("That public_id was not issued for an admin image upload.");
    }

    const resource = await fetchResource({
      publicId,
      resourceType: "image",
      deliveryType: "upload",
    });

    if (resource === null) throw unprocessable("No such upload. It may have failed.");

    const reject = async (reason: string, detail?: string): Promise<never> => {
      const destroyed = await destroyAsset({
        publicId,
        resourceType: "image",
        deliveryType: "upload",
      });
      logger().warn("media.confirm_rejected", { publicId, reason, detail, destroyed });
      throw unprocessable(`Upload rejected: ${reason}`, { destroyed });
    };

    if (resource.resource_type !== "image" || resource.type !== "upload") {
      await reject("unexpected resource type");
    }

    const format = (resource.format ?? "").toLowerCase();
    if (!ALLOWED_IMAGE_FORMATS.includes(format as (typeof ALLOWED_IMAGE_FORMATS)[number])) {
      await reject("format not allowed", format);
    }

    // Cloudinary decoded it, so missing dimensions means it is not a real image.
    if (typeof resource.width !== "number" || typeof resource.height !== "number") {
      await reject("not a decodable image");
    }

    // 🔴 The only size control that exists (D-039 C-1).
    if (typeof resource.bytes !== "number" || resource.bytes > MAX_BYTES.image) {
      await reject("too large", String(resource.bytes ?? "unknown"));
    }

    const row = await insertMedia({
      publicId,
      resourceType: "image",
      deliveryType: "upload",
      visibility: "public",
      format,
      resource,
      altDefault: altDefault ?? null,
      folder: publicId.split("/").slice(-2, -1)[0] ?? null,
      uploadedBy: session.user.id,
    });

    await audit({
      actorId: session.user.id,
      action: "create",
      entityType: "media",
      entityId: row.id,
      diff: { publicId, format, bytes: row.bytes },
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return respond(row, { admin: true, cache: CACHE_NO_STORE, status: 201 });
  });
}
