/**
 * GET /api/admin/applications/{id}/resume-signed-url — the ONLY way a CV is
 * read.
 *
 * 🔴 Keyed on the application's internal UUID, not on its reference. References
 * are quoted over the phone and guessable (X-33); a UUID is not, and this
 * endpoint additionally requires an admin session. Both together are the
 * authorisation — never the reference alone.
 *
 * 🔴 Audited as `resume_download` BEFORE the URL is minted. These are people's
 * CVs; who opened one, and when, is part of the security model, and an audit
 * written afterwards could be lost exactly when it matters.
 *
 * 🔴 Never email-attached (SECURITY-DESIGN §resumes) — and under D-038 there is
 * no outbound mail to attach one to.
 */

import { requireAdmin } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { notFound, unavailable } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, respond } from "@/lib/http";
import { queryOne } from "@/lib/db";
import { isCloudinaryConfigured } from "@/lib/cloudinary/client";
import { privateUrl } from "@/lib/cloudinary/upload";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TTL_SECONDS = 120;

function idFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/");
  const id = decodeURIComponent(parts[parts.length - 2] ?? "");
  if (!UUID.test(id)) throw notFound();
  return id;
}

export function GET(request: Request): Promise<Response> {
  return handle(
    "GET /api/admin/applications/{id}/resume-signed-url",
    async () => {
      const session = await requireAdmin();

      if (!isCloudinaryConfigured()) throw unavailable("Media storage is not configured.");

      const id = idFrom(request);

      // 🔴 Joined, so the asset must belong to THIS application. Reading the
      // media id from the request instead would be an IDOR: any admin-session
      // holder could name any media row, including one from another applicant.
      const row = await queryOne<{
        reference: string;
        media_id: string;
        public_id: string;
        resource_type: "image" | "raw";
        format: string;
      }>(
        `SELECT a.reference, m.id::text AS media_id, m.public_id, m.resource_type, m.format
           FROM applications a
           JOIN media m ON m.id = a.resume_media_id
          WHERE a.id = $1 AND m.deleted_at IS NULL`,
        [id],
      );

      if (!row) throw notFound();

      await audit({
        actorId: session.user.id,
        action: "resume_download",
        entityType: "applications",
        entityId: id,
        diff: { reference: row.reference, mediaId: row.media_id, ttlSeconds: TTL_SECONDS },
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined,
      });

      const url = privateUrl({
        publicId: row.public_id,
        resourceType: row.resource_type,
        format: row.format,
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
