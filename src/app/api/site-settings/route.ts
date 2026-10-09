/**
 * GET /api/site-settings — public operation 17, "the big one".
 *
 * Logical Phase **8a**; executes as **E9, BEFORE the generator** (D-033),
 * because the generator cannot be built or verified without it.
 *
 * 🔴 Applies the **D-029** per-field resolution: the five global location fields
 * come from the first active branch by `sort_order` that holds a value, NOT from
 * `is_primary` — whose address, geo and hours are all NULL.
 *
 * 🔴 Returns the **structured** hours model (D-028). The `{days, time}` display
 * shape is the generator's job; producing it here too would put one transform in
 * two places.
 *
 * It returns nulls rather than 500-ing when a field is unresolved — it is a read
 * endpoint, and the generator is the component that fails loudly. The
 * `resolution` block tells it exactly what is missing and why.
 */

import { handle, respond } from "@/lib/http";
import { guardPublicRead, notModified, publicReadHeaders } from "@/lib/public-read";
import { buildSiteSettings } from "@/lib/settings/site-settings";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return handle("GET /api/site-settings", async () => {
    await guardPublicRead(request, "site-settings");

    const payload = await buildSiteSettings();

    const fresh = notModified(request, payload.updatedAt);
    if (fresh) return fresh;

    return respond(payload, { headers: publicReadHeaders(payload.updatedAt) });
  });
}
