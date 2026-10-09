/**
 * DELETE /api/admin/media/{id} — remove an asset.
 *
 * 🔴 REFUSES while anything still references it. `gallery_images.media_id` is
 * `NOT NULL ON DELETE RESTRICT` (D-032) and `services.image_media_id` is
 * `ON DELETE SET NULL` — so a careless delete would either fail obscurely at the
 * database or silently blank a service image on the live site. Listing the
 * referencing rows tells the administrator what to detach first.
 *
 * The database row is SOFT-deleted and the Cloudinary asset is destroyed. That
 * order matters: if the destroy fails, the row is already hidden from the
 * library and the failure is logged, rather than the row surviving as a pointer
 * to something that may or may not still exist.
 */

import { requireAdminMutation } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { conflict, notFound } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, respond } from "@/lib/http";
import { destroyAsset } from "@/lib/cloudinary/upload";
import { findMediaById, mediaReferences, softDeleteMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idFrom(request: Request): string {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  if (!UUID.test(id)) throw notFound();
  return id;
}

export function DELETE(request: Request): Promise<Response> {
  return handle(
    "DELETE /api/admin/media/{id}",
    async () => {
      const session = await requireAdminMutation(request);

      const id = idFrom(request);
      const media = await findMediaById(id);
      if (!media) throw notFound();

      const refs = await mediaReferences(id);
      if (refs.length > 0) {
        throw conflict("That asset is still in use.", { referencedBy: refs });
      }

      const removed = await softDeleteMedia(id);
      if (!removed) throw notFound();

      const destroyed = await destroyAsset({
        publicId: media.publicId,
        resourceType: media.resourceType,
        deliveryType: media.deliveryType,
      });

      await audit({
        actorId: session.user.id,
        action: "delete",
        entityType: "media",
        entityId: id,
        diff: { publicId: media.publicId, cloudinaryDestroyed: destroyed },
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
