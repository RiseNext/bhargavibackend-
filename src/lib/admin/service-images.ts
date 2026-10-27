/**
 * Service image collections — the admin write half of D-044's slider feature.
 *
 *   GET    /api/admin/services/{id}/images
 *   POST   /api/admin/services/{id}/images
 *   PATCH  /api/admin/services/{id}/images/{imageId}
 *   DELETE /api/admin/services/{id}/images/{imageId}
 *   POST   /api/admin/services/{id}/images/reorder
 *
 * Modelled on `page-copy.ts`'s `content_block_items` handlers, which are the
 * existing in-house pattern for a media-backed ordered child collection: the
 * same guards, the same audit rows, the same publish calls.
 *
 * 🔴 EVERY QUERY IS SCOPED BY `service_id`, including the reorder. The client
 * requirement is that updating Acupressure's images cannot touch Acupuncture's,
 * and an id-list endpoint that trusted its ids would do exactly that for anyone
 * who posted a sibling service's row ids. `content-block-items/reorder` does
 * not scope that way; this deliberately does, and `rowCount` is compared
 * against the submitted length so a partial match fails the whole request
 * rather than reordering a subset.
 */

import { z } from "zod";
import { audit } from "../audit";
import { requireAdmin, requireAdminMutation } from "../auth/guard";
import { query, queryOne, transaction } from "../db";
import { queueDeployHook } from "../deploy-hook";
import { revalidateForReasonDetached } from "../revalidate";
import { invalidJson, notFound, unprocessable } from "../errors";
import { CACHE_NO_STORE, clientIp, handle, items, readJsonBody, respond } from "../http";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `secure_url` is joined in so the admin list can render a preview without a
 * second round trip, exactly as `MediaPicker` expects to receive it.
 *
 * 🔴 ALIASED TO camelCase, deliberately. CLAUDE.md §7 states the boundary rule
 * — `snake_case` in the database, `camelCase` over the wire — and this
 * resource's own write verbs already honour it: POST takes `mediaId`, PATCH
 * takes `isDefault`. The list was returning `is_default` / `sort_order` /
 * `secure_url` while `ImageCollectionEditor`'s `SlideRow` reads `isDefault`,
 * `sortOrder` and `secureUrl`, so one resource answered in two conventions
 * depending on the verb.
 *
 * ⚠ WHAT MADE IT HARMLESS SO FAR, and why that is not a reason to leave it. No
 * screen fetches this endpoint today: the service edit page is a server
 * component that runs its own query and maps the columns itself, and the editor
 * calls `router.refresh()` rather than re-reading. So the next consumer is the
 * one that breaks, and it breaks QUIETLY — `row.isDefault` is `undefined`, so
 * every slide reads as "not the main image" and `secureUrl !== null` is TRUE
 * for a missing value, which hands `undefined` to `next/image`.
 */
const IMAGE_COLUMNS = `
  si.id::text AS id, si.service_id::text AS "serviceId", si.media_id::text AS "mediaId",
  si.alt, si.sort_order AS "sortOrder", si.is_default AS "isDefault",
  m.secure_url AS "secureUrl", m.public_id AS "publicId",
  si.created_at AS "createdAt", si.updated_at AS "updatedAt"`;

const IMAGE_FROM = `
  FROM service_images si
  JOIN media m ON m.id = si.media_id`;

async function readBody(request: Request): Promise<unknown> {
  const body = await readJsonBody(request, 32 * 1024);
  if (body.kind === "too_large") throw unprocessable("Body is too large.");
  if (body.kind !== "ok") throw invalidJson();
  return body.value;
}

function segments(request: Request): string[] {
  return new URL(request.url).pathname.split("/").filter(Boolean);
}

/**
 * `/api/admin/services/{serviceId}/images[/{imageId}|/reorder]`
 *
 * Read positionally from the end so the handler does not depend on the mount
 * point, matching `blog-blocks.ts`'s `pathIds`.
 */
function pathIds(request: Request): { serviceId: string; imageId?: string } {
  const parts = segments(request);
  const at = parts.lastIndexOf("images");
  const serviceId = decodeURIComponent(parts[at - 1] ?? "");
  if (!UUID.test(serviceId)) throw notFound();

  const tail = parts[at + 1];
  if (tail === undefined || tail === "reorder") return { serviceId };

  const imageId = decodeURIComponent(tail);
  if (!UUID.test(imageId)) throw notFound();
  return { serviceId, imageId };
}

/** A service must exist and not be soft-deleted before its images are touched. */
async function assertService(serviceId: string): Promise<void> {
  const row = await queryOne<{ id: string }>(
    "SELECT id::text AS id FROM services WHERE id = $1 AND deleted_at IS NULL",
    [serviceId],
  );
  if (!row) throw notFound();
}

/**
 * 🔴 The media guard. A slide must be a PUBLIC IMAGE.
 *
 * `MediaPicker` only offers public images, but a UI filter is not a control:
 * this endpoint is reachable with any media id an authenticated admin cares to
 * post. An uploaded CV is `visibility = 'private'` with a NULL `secure_url`
 * (enforced by `media_private_has_no_public_url`), so admitting one here would
 * put a patient's résumé into a public slider — the precise risk D-018's
 * split exists to prevent.
 */
async function assertUsableMedia(mediaId: string): Promise<void> {
  const row = await queryOne<{ visibility: string; resource_type: string }>(
    `SELECT visibility::text AS visibility, resource_type::text AS resource_type
       FROM media WHERE id = $1 AND deleted_at IS NULL`,
    [mediaId],
  );
  if (!row) throw unprocessable("That image is not in the media library.");
  if (row.resource_type !== "image") {
    throw unprocessable("Only an image can be used as a slide.");
  }
  if (row.visibility !== "public") {
    throw unprocessable(
      "That file is private and can never be shown on the public site.",
    );
  }
}

// ---------------------------------------------------------------------------
// GET — list
// ---------------------------------------------------------------------------

export const listServiceImages = (request: Request): Promise<Response> =>
  handle(
    "GET /api/admin/services/{id}/images",
    async () => {
      await requireAdmin();
      const { serviceId } = pathIds(request);
      await assertService(serviceId);

      const rows = await query<Record<string, unknown>>(
        `SELECT ${IMAGE_COLUMNS} ${IMAGE_FROM}
          WHERE si.service_id = $1
          ORDER BY si.sort_order, si.id`,
        [serviceId],
      );

      return items(rows, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

// ---------------------------------------------------------------------------
// POST — add a slide
// ---------------------------------------------------------------------------

const createSchema = z
  .object({
    mediaId: z.string().uuid(),
    alt: z.string().trim().min(1).max(300),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const createServiceImage = (request: Request): Promise<Response> =>
  handle(
    "POST /api/admin/services/{id}/images",
    async () => {
      const session = await requireAdminMutation(request);
      const { serviceId } = pathIds(request);
      await assertService(serviceId);

      const parsed = createSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        throw unprocessable(
          `Invalid image: ${parsed.error.issues
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .join("; ")}`,
        );
      }
      const input = parsed.data;
      await assertUsableMedia(input.mediaId);

      const already = await queryOne<{ id: string }>(
        "SELECT id::text AS id FROM service_images WHERE service_id = $1 AND media_id = $2",
        [serviceId, input.mediaId],
      );
      if (already) {
        // Caught here as well as by the unique index, so the editor gets a
        // sentence instead of a constraint-violation 500.
        throw unprocessable("That image is already in this service's slider.");
      }

      const row = await transaction(async (client) => {
        const next = await client.query<{ next: string }>(
          `SELECT coalesce(max(sort_order), 0) + 1 AS next
             FROM service_images WHERE service_id = $1`,
          [serviceId],
        );
        const sortOrder = Number(next.rows[0]?.next ?? 1);

        // The FIRST image of an empty collection becomes the default on its
        // own. Requiring a second, separate click to make the only slide the
        // main slide would be a pointless step that an editor would forget,
        // leaving a collection whose opening frame is implicit.
        const existing = await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM service_images WHERE service_id = $1",
          [serviceId],
        );
        const isFirst = Number(existing.rows[0]?.count ?? "0") === 0;
        const wantsDefault = input.isDefault === true || isFirst;

        if (wantsDefault) {
          // Clear the incumbent first: `service_images_one_default_idx` permits
          // exactly one, so setting a second without this is a 23505.
          await client.query(
            "UPDATE service_images SET is_default = false WHERE service_id = $1 AND is_default",
            [serviceId],
          );
        }

        const res = await client.query<Record<string, unknown>>(
          `INSERT INTO service_images (service_id, media_id, alt, sort_order, is_default)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id::text AS id, service_id::text AS "serviceId",
                     media_id::text AS "mediaId", alt,
                     sort_order AS "sortOrder", is_default AS "isDefault",
                     created_at AS "createdAt", updated_at AS "updatedAt"`,
          [serviceId, input.mediaId, input.alt, sortOrder, wantsDefault],
        );
        const inserted = res.rows[0];
        if (!inserted) throw new Error("INSERT into service_images returned no row");

        await audit(
          {
            actorId: session.user.id,
            action: "create",
            entityType: "service_images",
            entityId: String(inserted.id),
            diff: { serviceId, mediaId: input.mediaId, isDefault: wantsDefault },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );

        return inserted;
      });

      queueDeployHook("service-images:create");
      revalidateForReasonDetached("service-images:create");
      return respond(row, { status: 201, admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

// ---------------------------------------------------------------------------
// PATCH — rename the alt text, or make this slide the main one
// ---------------------------------------------------------------------------

const patchSchema = z
  .object({
    alt: z.string().trim().min(1).max(300).optional(),
    isDefault: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => v.alt !== undefined || v.isDefault !== undefined, {
    message: "nothing to update",
  });

/**
 * ⚠ `isDefault` accepts only `true`.
 *
 * "Un-defaulting" the main image without naming a replacement would leave the
 * collection with no chosen opening frame, and the only honest way to express
 * that in one request is to set a different slide as default instead. Clearing
 * happens implicitly and safely when the default row is DELETED (below).
 */
export const patchServiceImage = (request: Request): Promise<Response> =>
  handle(
    "PATCH /api/admin/services/{id}/images/{imageId}",
    async () => {
      const session = await requireAdminMutation(request);
      const { serviceId, imageId } = pathIds(request);
      if (imageId === undefined) throw notFound();
      await assertService(serviceId);

      const parsed = patchSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        throw unprocessable(
          `Invalid change: ${parsed.error.issues
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .join("; ")}`,
        );
      }
      const input = parsed.data;

      const row = await transaction(async (client) => {
        // Scoped by BOTH ids, so a row id from another service is a 404 rather
        // than a cross-service write.
        const before = await client.query<{ id: string }>(
          "SELECT id::text AS id FROM service_images WHERE id = $1 AND service_id = $2",
          [imageId, serviceId],
        );
        if (before.rows[0] === undefined) throw notFound();

        if (input.isDefault === true) {
          await client.query(
            `UPDATE service_images SET is_default = false
              WHERE service_id = $1 AND is_default AND id <> $2`,
            [serviceId, imageId],
          );
        }

        const sets: string[] = [];
        const values: unknown[] = [imageId, serviceId];
        if (input.alt !== undefined) {
          sets.push(`alt = $${String(values.length + 1)}`);
          values.push(input.alt);
        }
        if (input.isDefault === true) sets.push("is_default = true");

        const res = await client.query<Record<string, unknown>>(
          `UPDATE service_images SET ${sets.join(", ")}
            WHERE id = $1 AND service_id = $2
            RETURNING id::text AS id, service_id::text AS "serviceId",
                      media_id::text AS "mediaId", alt,
                      sort_order AS "sortOrder", is_default AS "isDefault",
                      created_at AS "createdAt", updated_at AS "updatedAt"`,
          values,
        );
        const updated = res.rows[0];
        if (!updated) throw notFound();

        await audit(
          {
            actorId: session.user.id,
            action: "update",
            entityType: "service_images",
            entityId: imageId,
            diff: {
              serviceId,
              ...(input.alt !== undefined ? { alt: input.alt } : {}),
              ...(input.isDefault === true ? { isDefault: true } : {}),
            },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );

        return updated;
      });

      queueDeployHook("service-images:update");
      revalidateForReasonDetached("service-images:update");
      return respond(row, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

// ---------------------------------------------------------------------------
// DELETE — remove a slide from this service
// ---------------------------------------------------------------------------

/**
 * 🔴 THIS DELETES THE SLIDE, NEVER THE CLOUDINARY ASSET.
 *
 * The image stays in the media library and in any other service that uses it.
 * Destroying the stored asset is `DELETE /api/admin/media/{id}`, which checks
 * `MEDIA_REFERENCE_SOURCES` first — and `service_images` is registered there,
 * so an asset a slider still shows reports as in use and is refused.
 *
 * ⚠ That registration, NOT the `ON DELETE RESTRICT` on `media_id`, is what
 * protects the asset. Media deletion is a soft delete plus a Cloudinary
 * destroy, so the FK never fires on that path.
 */
export const deleteServiceImage = (request: Request): Promise<Response> =>
  handle(
    "DELETE /api/admin/services/{id}/images/{imageId}",
    async () => {
      const session = await requireAdminMutation(request);
      const { serviceId, imageId } = pathIds(request);
      if (imageId === undefined) throw notFound();
      await assertService(serviceId);

      const promoted = await transaction(async (client) => {
        const before = await client.query<{ is_default: boolean }>(
          "SELECT is_default FROM service_images WHERE id = $1 AND service_id = $2",
          [imageId, serviceId],
        );
        const removed = before.rows[0];
        if (removed === undefined) throw notFound();

        await client.query(
          "DELETE FROM service_images WHERE id = $1 AND service_id = $2",
          [imageId, serviceId],
        );

        // Removing the MAIN image must leave a valid one chosen rather than a
        // collection with no opening frame. The first remaining slide by
        // display order inherits it; an emptied collection simply has none,
        // which the partial unique index allows and the reader handles.
        let next: string | null = null;
        if (removed.is_default) {
          const candidate = await client.query<{ id: string }>(
            `SELECT id::text AS id FROM service_images
              WHERE service_id = $1 ORDER BY sort_order, id LIMIT 1`,
            [serviceId],
          );
          const id = candidate.rows[0]?.id;
          if (id !== undefined) {
            await client.query("UPDATE service_images SET is_default = true WHERE id = $1", [
              id,
            ]);
            next = id;
          }
        }

        await audit(
          {
            actorId: session.user.id,
            action: "delete",
            entityType: "service_images",
            entityId: imageId,
            diff: {
              serviceId,
              wasDefault: removed.is_default,
              ...(next !== null ? { promoted: next } : {}),
            },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );

        return next;
      });

      queueDeployHook("service-images:delete");
      revalidateForReasonDetached("service-images:delete");
      return respond(
        { ok: true, ...(promoted !== null ? { promotedToDefault: promoted } : {}) },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );

// ---------------------------------------------------------------------------
// POST /reorder
// ---------------------------------------------------------------------------

const reorderSchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(60) })
  .strict();

export const reorderServiceImages = (request: Request): Promise<Response> =>
  handle(
    "POST /api/admin/services/{id}/images/reorder",
    async () => {
      const session = await requireAdminMutation(request);
      const { serviceId } = pathIds(request);
      await assertService(serviceId);

      const parsed = reorderSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        throw unprocessable("`ids` must be a non-empty array of image ids.");
      }
      const ids = parsed.data.ids;
      if (new Set(ids).size !== ids.length) throw unprocessable("`ids` contains duplicates.");

      await transaction(async (client) => {
        // One statement, so the list is never visibly half-reordered — and
        // `si.service_id = $2` is what keeps another service's rows out.
        const res = await client.query(
          `UPDATE service_images AS si SET sort_order = o.position
             FROM (SELECT id, row_number() OVER () AS position
                     FROM unnest($1::uuid[]) AS id) AS o
            WHERE si.id = o.id AND si.service_id = $2`,
          [ids, serviceId],
        );

        // 🔴 Every submitted id must have belonged to THIS service. A short
        // count means the caller sent a foreign or stale id, and silently
        // reordering the subset would renumber this service's slider using
        // positions derived from another one's.
        if ((res.rowCount ?? 0) !== ids.length) {
          throw unprocessable(
            "Those image ids do not all belong to this service. Reload the page and try again.",
          );
        }

        await audit(
          {
            actorId: session.user.id,
            action: "reorder",
            entityType: "service_images",
            diff: { serviceId, count: ids.length },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );
      });

      queueDeployHook("service-images:reorder");
      revalidateForReasonDetached("service-images:reorder");
      return respond({ ok: true }, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );
