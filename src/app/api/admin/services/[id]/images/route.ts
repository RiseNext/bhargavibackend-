/**
 * GET · POST /api/admin/services/{id}/images — this service's slider images.
 */

import { createServiceImage, listServiceImages } from "@/lib/admin/service-images";

export const dynamic = "force-dynamic";

export const GET = listServiceImages;
export const POST = createServiceImage;
