/**
 * PATCH · DELETE /api/admin/services/{id}/images/{imageId}.
 *
 * PATCH edits the alt text or makes this slide the main one. DELETE removes the
 * slide from this service and NEVER destroys the stored Cloudinary asset.
 */

import { deleteServiceImage, patchServiceImage } from "@/lib/admin/service-images";

export const dynamic = "force-dynamic";

export const PATCH = patchServiceImage;
export const DELETE = deleteServiceImage;
