/**
 * GET /api/admin/site-settings — the singleton, as stored.
 * PUT /api/admin/site-settings — update it.
 *
 * `PUT` rather than `PATCH` because this is a single form the editor saves as a
 * whole; absent keys are still left untouched, so a partial save is safe.
 *
 * 🔴 `phones[]` is NOT here. It is derived from `branches` ordered by
 * `phone_sort_order` (D-013), and exposing it on this screen would create a
 * second place to change a phone number.
 *
 * 🔴 The five global location fields are not here either — they resolve from
 * branches per D-029. `resolution` is returned read-only so the UI can show an
 * editor which branch currently supplies each one.
 */

import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireAdmin, requireAdminMutation } from "@/lib/auth/guard";
import { queryOne, transaction } from "@/lib/db";
import { queueDeployHook } from "@/lib/deploy-hook";
import { revalidateForReasonDetached } from "@/lib/revalidate";
import { invalidJson, notFound, unprocessable } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, readJsonBody, respond } from "@/lib/http";
import { loadBranches } from "@/lib/settings/site-settings";
import { missingRequiredGlobals, resolveGlobals } from "@/lib/settings/resolve";

export const dynamic = "force-dynamic";

const COLUMNS = `
  business_name, short_name, tagline, description, locale,
  founder_name, founder_honorific, founder_qualifications, founder_role,
  founder_photo_media_id::text AS founder_photo_media_id,
  public_email, default_whatsapp_e164, default_notify_email, careers_notify_email,
  price_range,
  logo_media_id::text AS logo_media_id,
  logo_lockup_media_id::text AS logo_lockup_media_id,
  og_media_id::text AS og_media_id,
  brand_color, theme_color,
  default_seo_title_template, default_seo_description, robots_allow,
  analytics_measurement_id, updated_at, updated_by::text AS updated_by`;

const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "must be a hex colour like #44683d");
const E164 = /^\+[1-9][0-9]{7,14}$/;

const fields = {
  businessName: z.string().trim().min(1).max(200),
  shortName: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(200).nullish(),
  description: z.string().trim().max(1000).nullish(),
  locale: z.string().trim().max(12),

  founderName: z.string().trim().max(200).nullish(),
  /** D-003 settles this: the rendered value everywhere today is "Mrs." */
  founderHonorific: z.string().trim().max(20).nullish(),
  founderQualifications: z.string().trim().max(300).nullish(),
  founderRole: z.string().trim().max(120).nullish(),
  founderPhotoMediaId: z.string().uuid().nullish(),

  publicEmail: z.string().trim().email().max(320).nullish(),
  defaultWhatsappE164: z.string().trim().regex(E164, "must be E.164").nullish(),
  /**
   * D-020 — notification destinations are ROW VALUES, never deployment config.
   * Supplying a real per-branch address later is a settings edit, not a
   * redeploy, which is exactly why these are columns.
   */
  defaultNotifyEmail: z.string().trim().email().max(320).nullish(),
  careersNotifyEmail: z.string().trim().email().max(320).nullish(),

  priceRange: z.string().trim().max(60).nullish(),

  logoMediaId: z.string().uuid().nullish(),
  logoLockupMediaId: z.string().uuid().nullish(),
  ogMediaId: z.string().uuid().nullish(),
  brandColor: hex.nullish(),
  /**
   * ⚠ Two different values exist today — `site.brandColor` is `#44683d` while
   * `viewport.themeColor` is `#3d2a1e`. Both are preserved rather than
   * reconciled, because reconciling one would change a rendered value.
   */
  themeColor: hex.nullish(),

  defaultSeoTitleTemplate: z.string().trim().max(200).nullish(),
  defaultSeoDescription: z.string().trim().max(500).nullish(),
  robotsAllow: z.boolean().optional(),
  /** Stays NULL until the client supplies one (C-15). Never invented. */
  analyticsMeasurementId: z.string().trim().max(40).nullish(),
};

const putSchema = z.object(fields).partial().strict();

const COLUMN_MAP: Record<keyof typeof fields, string> = {
  businessName: "business_name",
  shortName: "short_name",
  tagline: "tagline",
  description: "description",
  locale: "locale",
  founderName: "founder_name",
  founderHonorific: "founder_honorific",
  founderQualifications: "founder_qualifications",
  founderRole: "founder_role",
  founderPhotoMediaId: "founder_photo_media_id",
  publicEmail: "public_email",
  defaultWhatsappE164: "default_whatsapp_e164",
  defaultNotifyEmail: "default_notify_email",
  careersNotifyEmail: "careers_notify_email",
  priceRange: "price_range",
  logoMediaId: "logo_media_id",
  logoLockupMediaId: "logo_lockup_media_id",
  ogMediaId: "og_media_id",
  brandColor: "brand_color",
  themeColor: "theme_color",
  defaultSeoTitleTemplate: "default_seo_title_template",
  defaultSeoDescription: "default_seo_description",
  robotsAllow: "robots_allow",
  analyticsMeasurementId: "analytics_measurement_id",
};

async function resolutionBlock(): Promise<Record<string, unknown>> {
  const branches = await loadBranches();
  const resolved = resolveGlobals(branches);

  return {
    provenance: resolved.provenance,
    missingRequired: missingRequiredGlobals(resolved),
    explanation:
      "address, geo, mapsUrl, mapEmbedSrc and hours are NOT settings — they resolve from the " +
      "first active branch, ordered by sortOrder, that actually has each one (D-029). Edit them " +
      "on the branch. whatsapp comes from the primary branch.",
  };
}

export function GET(): Promise<Response> {
  return handle(
    "GET /api/admin/site-settings",
    async () => {
      await requireAdmin();

      const row = await queryOne<Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM site_settings WHERE id = 1`,
      );
      if (!row) throw notFound();

      return respond(
        { ...row, resolution: await resolutionBlock() },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );
}

export function PUT(request: Request): Promise<Response> {
  return handle(
    "PUT /api/admin/site-settings",
    async () => {
      const session = await requireAdminMutation(request);

      const body = await readJsonBody(request, 64 * 1024);
      if (body.kind !== "ok") throw invalidJson();

      const parsed = putSchema.safeParse(body.value);
      if (!parsed.success) {
        throw unprocessable(
          `Invalid settings: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }

      const changes: Record<string, unknown> = {};
      for (const [key, column] of Object.entries(COLUMN_MAP)) {
        const value = parsed.data[key as keyof typeof fields];
        if (value !== undefined) changes[column] = value;
      }

      if (Object.keys(changes).length === 0) throw unprocessable("Nothing to change.");

      const before = await queryOne<Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM site_settings WHERE id = 1`,
      );
      if (!before) throw notFound();

      const keys = Object.keys(changes);
      const setClause = keys.map((k, i) => `${k} = $${String(i + 2)}`).join(", ");

      const row = await transaction(async (client) => {
        const res = await client.query<Record<string, unknown>>(
          `UPDATE site_settings SET ${setClause}, updated_by = $1 WHERE id = 1 RETURNING ${COLUMNS}`,
          [session.user.id, ...keys.map((k) => changes[k])],
        );
        const updated = res.rows[0];
        if (!updated) throw notFound();

        const diff: Record<string, unknown> = {};
        for (const key of keys) diff[key] = { from: before[key], to: changes[key] };

        await audit(
          {
            actorId: session.user.id,
            action: "update",
            entityType: "site_settings",
            entityId: "1",
            // `redactDiff` strips the notify-email values; which FIELD changed
            // is what the trail needs.
            diff,
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );

        return updated;
      });

      queueDeployHook("site-settings:update");
      // D-042: publish by cache invalidation. Runs ALONGSIDE the hook
      // until every consumer reads content at runtime.
      revalidateForReasonDetached("site-settings:update");

      return respond(
        { ...row, resolution: await resolutionBlock() },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );
}
