/**
 * DELETE /api/admin/applications/{id}/resume — remove a CV.
 *
 * Retention: a CV is personal data the clinic should be able to erase on
 * request without deleting the application record itself, which carries the
 * hiring history. So this detaches and destroys the file and leaves the row.
 *
 * 🔴 The media row is soft-deleted AND the Cloudinary asset destroyed. A soft
 * delete alone would leave the actual file sitting in the account — which is
 * not erasure, and would be the wrong answer to "please delete my CV".
 *
 * The application keeps `resume_confirmed_at = NULL` afterwards and gains no
 * rejection reason: the upload was valid, it was deleted. `resume_media_id`
 * going NULL is what the admin screen reads as "no CV on file".
 */

import { requireAdminMutation } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, respond } from "@/lib/http";
import { query, queryOne } from "@/lib/db";
import { destroyAsset } from "@/lib/cloudinary/upload";
import { softDeleteMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/");
  const id = decodeURIComponent(parts[parts.length - 2] ?? "");
  if (!UUID.test(id)) throw notFound();
  return id;
}

export function DELETE(request: Request): Promise<Response> {
  return handle(
    "DELETE /api/admin/applications/{id}/resume",
    async () => {
      const session = await requireAdminMutation(request);
      const id = idFrom(request);

      const row = await queryOne<{
        reference: string;
        media_id: string;
        public_id: string;
        resource_type: "image" | "raw";
        delivery_type: "upload" | "authenticated";
      }>(
        `SELECT a.reference, m.id::text AS media_id, m.public_id,
                m.resource_type, m.delivery_type
           FROM applications a
           JOIN media m ON m.id = a.resume_media_id
          WHERE a.id = $1 AND m.deleted_at IS NULL`,
        [id],
      );

      if (!row) throw notFound();

      // Detach first: while the FK still points at it, the media row cannot be
      // reported as unreferenced, and a half-done delete should leave the
      // application readable rather than pointing at a destroyed file.
      await query(
        `UPDATE applications
            SET resume_media_id = NULL,
                resume_confirmed_at = NULL,
                updated_at = now()
          WHERE id = $1`,
        [id],
      );

      await softDeleteMedia(row.media_id);

      const destroyed = await destroyAsset({
        publicId: row.public_id,
        resourceType: row.resource_type,
        deliveryType: row.delivery_type,
      });

      await audit({
        actorId: session.user.id,
        action: "delete",
        entityType: "applications",
        entityId: id,
        diff: {
          reference: row.reference,
          resumeDeleted: true,
          mediaId: row.media_id,
          cloudinaryDestroyed: destroyed,
        },
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined,
      });

      return respond({ ok: true, cloudinaryDestroyed: destroyed }, {
        admin: true,
        cache: CACHE_NO_STORE,
      });
    },
    { admin: true },
  );
}
