/**
 * GET /api/admin/media/{id}/signed-url — a short-lived URL for a PRIVATE asset.
 *
 * 🔴 Only private assets. A public asset already has a durable `secure_url` in
 * its row; minting a signed URL for one would imply a protection that is not
 * there, and callers would learn the wrong lesson about which assets are safe
 * to share.
 *
 * 🔴 EVERY call is audited as `resume_download`, before the URL is returned.
 * These assets are people's CVs: who looked, and when, is part of the security
 * model (SECURITY-DESIGN §resumes), and an audit written after the response
 * could be lost on a crash.
 *
 * Uses `private_download_url` — a `sign_url` delivery URL returns 401 for
 * `authenticated` + `raw` (D-039 C-3).
 */

import { requireAdmin } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { notFound, unavailable, unprocessable } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, respond } from "@/lib/http";
import { isCloudinaryConfigured } from "@/lib/cloudinary/client";
import { privateUrl } from "@/lib/cloudinary/upload";
import { findMediaById } from "@/lib/media";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Short enough that a leaked URL is near-useless, long enough to click. */
const TTL_SECONDS = 120;

function idFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/");
  const id = decodeURIComponent(parts[parts.length - 2] ?? "");
  if (!UUID.test(id)) throw notFound();
  return id;
}

export function GET(request: Request): Promise<Response> {
  return handle(
    "GET /api/admin/media/{id}/signed-url",
    async () => {
      const session = await requireAdmin();

      if (!isCloudinaryConfigured()) throw unavailable("Media storage is not configured.");

      const id = idFrom(request);
      const media = await findMediaById(id);
      if (!media) throw notFound();

      if (media.visibility !== "private") {
        throw unprocessable("That asset is public — use its stored URL.");
      }

      await audit({
        actorId: session.user.id,
        action: "resume_download",
        entityType: "media",
        entityId: media.id,
        diff: { publicId: media.publicId, ttlSeconds: TTL_SECONDS },
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined,
      });

      const url = privateUrl({
        publicId: media.publicId,
        resourceType: media.resourceType,
        format: media.format,
        ttlSeconds: TTL_SECONDS,
      });

      return respond(
        { url, expiresInSeconds: TTL_SECONDS },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );
}
