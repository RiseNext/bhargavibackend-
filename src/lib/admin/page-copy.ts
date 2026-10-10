/**
 * Page-copy admin — E15's write half. **13 operations across 8 paths.**
 *
 *   page-meta      GET · GET/{page} · PUT/{page}                       (3)
 *   content-blocks GET · GET/{page}/{slot} · PUT/{page}/{slot}         (3)
 *   block items    GET · POST · PUT/{id} · DELETE/{id} · POST /reorder (5)
 *   …plus the two content-blocks list/detail reads counted above       (2)
 *
 * These are KEYED SINGLETONS, not a collection: a content block is addressed by
 * `(page, slot)` and is created by the seed, not by an editor. There is
 * deliberately no POST and no DELETE for blocks — inventing a slot the frontend
 * does not render would produce content nobody can see, and deleting one would
 * blank a live section.
 *
 * 🔴 `extra` is validated against the per-slot allowlist on write (D-024). An
 * unknown key is rejected rather than stored.
 */

import { z } from "zod";
import { audit } from "../audit";
import { requireAdmin, requireAdminMutation } from "../auth/guard";
import { query, queryOne, transaction } from "../db";
import { queueDeployHook } from "../deploy-hook";
import { revalidateForReasonDetached } from "../revalidate";
import { invalidJson, notFound, unprocessable } from "../errors";
import { CACHE_NO_STORE, clientIp, handle, items, readJsonBody, respond } from "../http";
import { allowedExtraKeys, validateExtra } from "../content/extra-allowlist";

const KEY = /^[a-z][a-zA-Z0-9_]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readBody(request: Request): Promise<unknown> {
  const body = await readJsonBody(request, 128 * 1024);
  if (body.kind === "too_large") throw unprocessable("Body is too large.");
  if (body.kind !== "ok") throw invalidJson();
  return body.value;
}

function segments(request: Request): string[] {
  return new URL(request.url).pathname.split("/").filter(Boolean);
}

// ===========================================================================
// page_meta
// ===========================================================================

const PAGE_META_COLUMNS = `
  id::text AS id, page, title, description, canonical,
  og_media_id::text AS og_media_id, noindex, created_at, updated_at`;

const pageMetaSchema = z
  .object({
    title: z.string().trim().max(200).nullish(),
    description: z.string().trim().max(400).nullish(),
    canonical: z.string().trim().max(400).nullish(),
    ogMediaId: z.string().uuid().nullish(),
    noindex: z.boolean().optional(),
  })
  .strict();

export const listPageMetaAdmin = (): Promise<Response> =>
  handle(
    "GET /api/admin/page-meta",
    async () => {
      await requireAdmin();
      const rows = await query<Record<string, unknown>>(
        `SELECT ${PAGE_META_COLUMNS} FROM page_meta ORDER BY page`,
      );
      return items(rows, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

function pageFrom(request: Request): string {
  const page = decodeURIComponent(segments(request).pop() ?? "");
  if (!KEY.test(page)) throw notFound();
  return page;
}

export const getPageMetaAdmin = (request: Request): Promise<Response> =>
  handle(
    "GET /api/admin/page-meta/{page}",
    async () => {
      await requireAdmin();
      const row = await queryOne<Record<string, unknown>>(
        `SELECT ${PAGE_META_COLUMNS} FROM page_meta WHERE page = $1`,
        [pageFrom(request)],
      );
      if (!row) throw notFound();
      return respond(row, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

export const putPageMetaAdmin = (request: Request): Promise<Response> =>
  handle(
    "PUT /api/admin/page-meta/{page}",
    async () => {
      const session = await requireAdminMutation(request);
      const page = pageFrom(request);

      const parsed = pageMetaSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        throw unprocessable(
          `Invalid page SEO: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }

      const map: Record<string, string> = {
        title: "title",
        description: "description",
        canonical: "canonical",
        ogMediaId: "og_media_id",
        noindex: "noindex",
      };

      const changes: Record<string, unknown> = {};
      for (const [key, column] of Object.entries(map)) {
        const value = parsed.data[key as keyof typeof parsed.data];
        if (value !== undefined) changes[column] = value;
      }
      if (Object.keys(changes).length === 0) throw unprocessable("Nothing to change.");

      const before = await queryOne<Record<string, unknown>>(
        `SELECT ${PAGE_META_COLUMNS} FROM page_meta WHERE page = $1`,
        [page],
      );
      if (!before) throw notFound();

      const keys = Object.keys(changes);
      const setClause = keys.map((k, i) => `${k} = $${String(i + 2)}`).join(", ");

      const row = await transaction(async (client) => {
        const res = await client.query<Record<string, unknown>>(
          `UPDATE page_meta SET ${setClause} WHERE page = $1 RETURNING ${PAGE_META_COLUMNS}`,
          [page, ...keys.map((k) => changes[k])],
        );
        const updated = res.rows[0];
        if (!updated) throw notFound();

        const diff: Record<string, unknown> = {};
        for (const key of keys) diff[key] = { from: before[key], to: changes[key] };

        await audit(
          {
            actorId: session.user.id,
            action: "update",
            entityType: "page_meta",
            entityId: page,
            diff,
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );

        return updated;
      });

      queueDeployHook("page-meta:update");
      // D-042: publish by cache invalidation. Runs ALONGSIDE the hook
      // until every consumer reads content at runtime.
      revalidateForReasonDetached("page-meta:update");

      return respond(
        {
          ...row,
          // Setting `noindex` removes a page from search results — worth saying
          // out loud rather than leaving to a checkbox label.
          ...(changes.noindex === true
            ? {
                warning:
                  "This page is now marked noindex and will be removed from search results.",
              }
            : {}),
        },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );

// ===========================================================================
// content_blocks
// ===========================================================================

const BLOCK_COLUMNS = `
  id::text AS id, page, slot, label, title, lead, body,
  cta_label, cta_href, cta2_label, cta2_href, extra, created_at, updated_at`;

const contentBlockSchema = z
  .object({
    label: z.string().trim().max(200).nullish(),
    /** May carry `*emphasis*` markers (D-037 / B6). */
    title: z.string().trim().max(500).nullish(),
    lead: z.string().trim().max(2000).nullish(),
    body: z.array(z.string().max(4000)).max(40).nullish(),
    ctaLabel: z.string().trim().max(120).nullish(),
    ctaHref: z.string().trim().max(500).nullish(),
    cta2Label: z.string().trim().max(120).nullish(),
    cta2Href: z.string().trim().max(500).nullish(),
    extra: z.record(z.unknown()).nullish(),
  })
  .strict();

export const listContentBlocksAdmin = (request: Request): Promise<Response> =>
  handle(
    "GET /api/admin/content-blocks",
    async () => {
      await requireAdmin();
      const page = new URL(request.url).searchParams.get("page");

      const rows = await query<Record<string, unknown>>(
        `SELECT ${BLOCK_COLUMNS} FROM content_blocks
          WHERE ($1::text IS NULL OR page = $1)
          ORDER BY page, slot`,
        [page !== null && KEY.test(page) ? page : null],
      );

      return items(rows, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

/** `/api/admin/content-blocks/{page}/{slot}` */
function pageSlotFrom(request: Request): { page: string; slot: string } {
  const parts = segments(request);
  const slot = decodeURIComponent(parts[parts.length - 1] ?? "");
  const page = decodeURIComponent(parts[parts.length - 2] ?? "");
  if (!KEY.test(page) || !KEY.test(slot)) throw notFound();
  return { page, slot };
}

export const getContentBlockAdmin = (request: Request): Promise<Response> =>
  handle(
    "GET /api/admin/content-blocks/{page}/{slot}",
    async () => {
      await requireAdmin();
      const { page, slot } = pageSlotFrom(request);

      const row = await queryOne<Record<string, unknown>>(
        `SELECT ${BLOCK_COLUMNS} FROM content_blocks WHERE page = $1 AND slot = $2`,
        [page, slot],
      );
      if (!row) throw notFound();

      return respond(
        {
          ...row,
          // Lets the admin form render only the fields this slot may carry,
          // rather than offering a free-text JSON box.
          allowedExtraKeys: allowedExtraKeys(page, slot),
        },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );

export const putContentBlockAdmin = (request: Request): Promise<Response> =>
  handle(
    "PUT /api/admin/content-blocks/{page}/{slot}",
    async () => {
      const session = await requireAdminMutation(request);
      const { page, slot } = pageSlotFrom(request);

      const parsed = contentBlockSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        throw unprocessable(
          `Invalid content block: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }

      const map: Record<string, string> = {
        label: "label",
        title: "title",
        lead: "lead",
        ctaLabel: "cta_label",
        ctaHref: "cta_href",
        cta2Label: "cta2_label",
        cta2Href: "cta2_href",
      };

      const changes: Record<string, unknown> = {};
      for (const [key, column] of Object.entries(map)) {
        const value = parsed.data[key as keyof typeof parsed.data];
        if (value !== undefined) changes[column] = value;
      }
      if (parsed.data.body !== undefined) {
        changes.body = parsed.data.body === null ? null : JSON.stringify(parsed.data.body);
      }

      if (parsed.data.extra !== undefined) {
        // 🔴 D-024 — a named-field escape hatch with a schema, not a bucket.
        const problems = validateExtra(
          page,
          slot,
          parsed.data.extra as Record<string, unknown> | null,
        );
        if (problems.length > 0) {
          throw unprocessable(
            `${problems.join(" ")} Allowed for this slot: ${
              allowedExtraKeys(page, slot).join(", ") || "(none)"
            }.`,
          );
        }
        changes.extra =
          parsed.data.extra === null ? null : JSON.stringify(parsed.data.extra);
      }

      if (Object.keys(changes).length === 0) throw unprocessable("Nothing to change.");

      const before = await queryOne<Record<string, unknown>>(
        `SELECT ${BLOCK_COLUMNS} FROM content_blocks WHERE page = $1 AND slot = $2`,
        [page, slot],
      );
      // 🔴 No upsert. A slot the frontend does not render would be invisible
      // content; slots come from the seed, which is derived from the snapshot.
      if (!before) throw notFound();

      const keys = Object.keys(changes);
      const setClause = keys.map((k, i) => `${k} = $${String(i + 3)}`).join(", ");

      const row = await transaction(async (client) => {
        const res = await client.query<Record<string, unknown>>(
          `UPDATE content_blocks SET ${setClause}
            WHERE page = $1 AND slot = $2 RETURNING ${BLOCK_COLUMNS}`,
          [page, slot, ...keys.map((k) => changes[k])],
        );
        const updated = res.rows[0];
        if (!updated) throw notFound();

        const diff: Record<string, unknown> = {};
        for (const key of keys) diff[key] = { from: before[key], to: changes[key] };

        await audit(
          {
            actorId: session.user.id,
            action: "update",
            entityType: "content_blocks",
            entityId: `${page}.${slot}`,
            diff,
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );

        return updated;
      });

      queueDeployHook("content-blocks:update");
      // D-042: publish by cache invalidation. Runs ALONGSIDE the hook
      // until every consumer reads content at runtime.
      revalidateForReasonDetached("content-blocks:update");
      return respond(row, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

// ===========================================================================
// content_block_items
// ===========================================================================

const ITEM_COLUMNS = `
  id::text AS id, block_id::text AS block_id, group_key, sort_order,
  item_type::text AS item_type, label, value, text, href, icon_key,
  media_id::text AS media_id, alt, lines, created_at, updated_at`;

const itemSchema = z
  .object({
    blockId: z.string().uuid(),
    groupKey: z.string().trim().regex(KEY, "must be a lowerCamelCase key").max(60),
    itemType: z.enum(["text", "label_value", "link_row", "image", "card"]),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    label: z.string().trim().max(200).nullish(),
    value: z.string().trim().max(500).nullish(),
    text: z.string().trim().max(2000).nullish(),
    href: z.string().trim().max(500).nullish(),
    iconKey: z.string().trim().max(60).nullish(),
    mediaId: z.string().uuid().nullish(),
    alt: z.string().trim().max(300).nullish(),
    lines: z.array(z.string().max(500)).max(12).nullish(),
  })
  .strict();

export const listBlockItems = (request: Request): Promise<Response> =>
  handle(
    "GET /api/admin/content-block-items",
    async () => {
      await requireAdmin();
      const blockId = new URL(request.url).searchParams.get("blockId");

      const rows = await query<Record<string, unknown>>(
        `SELECT ${ITEM_COLUMNS} FROM content_block_items
          WHERE ($1::uuid IS NULL OR block_id = $1::uuid)
          ORDER BY block_id, group_key, sort_order, id`,
        [blockId !== null && UUID.test(blockId) ? blockId : null],
      );

      return items(rows, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

/** Shared normalisation: an image item must carry alt text (table CHECK too). */
function itemColumns(input: z.infer<typeof itemSchema>): Record<string, unknown> {
  if (input.mediaId != null && (input.alt == null || input.alt.trim() === "")) {
    throw unprocessable("An image item needs alt text describing the image.");
  }

  return {
    block_id: input.blockId,
    group_key: input.groupKey,
    item_type: input.itemType,
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
    label: input.label ?? null,
    value: input.value ?? null,
    text: input.text ?? null,
    href: input.href ?? null,
    icon_key: input.iconKey ?? null,
    media_id: input.mediaId ?? null,
    alt: input.alt ?? null,
    lines: input.lines == null ? null : JSON.stringify(input.lines),
  };
}

export const createBlockItem = (request: Request): Promise<Response> =>
  handle(
    "POST /api/admin/content-block-items",
    async () => {
      const session = await requireAdminMutation(request);

      const parsed = itemSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        throw unprocessable(
          `Invalid item: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }

      const block = await queryOne<{ page: string; slot: string }>(
        "SELECT page, slot FROM content_blocks WHERE id = $1",
        [parsed.data.blockId],
      );
      if (!block) throw unprocessable("That content block does not exist.");

      const columns = itemColumns(parsed.data);

      const row = await transaction(async (client) => {
        if (columns.sort_order === undefined) {
          const next = await client.query<{ next: string }>(
            `SELECT coalesce(max(sort_order), 0) + 1 AS next FROM content_block_items
              WHERE block_id = $1 AND group_key = $2`,
            [parsed.data.blockId, parsed.data.groupKey],
          );
          columns.sort_order = Number(next.rows[0]?.next ?? 1);
        }

        const keys = Object.keys(columns);
        const placeholders = keys.map((_, i) => `$${String(i + 1)}`).join(", ");

        const res = await client.query<Record<string, unknown>>(
          `INSERT INTO content_block_items (${keys.join(", ")}) VALUES (${placeholders})
           RETURNING ${ITEM_COLUMNS}`,
          keys.map((k) => columns[k]),
        );
        const inserted = res.rows[0];
        if (!inserted) throw new Error("INSERT into content_block_items returned no row");

        await audit(
          {
            actorId: session.user.id,
            action: "create",
            entityType: "content_block_items",
            entityId: String(inserted.id),
            diff: { slot: `${block.page}.${block.slot}`, groupKey: parsed.data.groupKey },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );

        return inserted;
      });

      queueDeployHook("content-block-items:create");
      // D-042: publish by cache invalidation. Runs ALONGSIDE the hook
      // until every consumer reads content at runtime.
      revalidateForReasonDetached("content-block-items:create");
      return respond(row, { status: 201, admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

function itemIdFrom(request: Request): string {
  const id = decodeURIComponent(segments(request).pop() ?? "");
  if (!UUID.test(id)) throw notFound();
  return id;
}

export const putBlockItem = (request: Request): Promise<Response> =>
  handle(
    "PUT /api/admin/content-block-items/{id}",
    async () => {
      const session = await requireAdminMutation(request);
      const id = itemIdFrom(request);

      const before = await queryOne<Record<string, unknown>>(
        `SELECT ${ITEM_COLUMNS} FROM content_block_items WHERE id = $1`,
        [id],
      );
      if (!before) throw notFound();

      const parsed = itemSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        throw unprocessable(
          `Invalid item: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }

      // PUT replaces the item wholesale, for the same reason as blog blocks:
      // which fields are meaningful depends on `item_type`.
      const columns = itemColumns(parsed.data);
      const keys = Object.keys(columns);
      const setClause = keys.map((k, i) => `${k} = $${String(i + 2)}`).join(", ");

      const row = await transaction(async (client) => {
        const res = await client.query<Record<string, unknown>>(
          `UPDATE content_block_items SET ${setClause} WHERE id = $1 RETURNING ${ITEM_COLUMNS}`,
          [id, ...keys.map((k) => columns[k])],
        );
        const updated = res.rows[0];
        if (!updated) throw notFound();

        await audit(
          {
            actorId: session.user.id,
            action: "update",
            entityType: "content_block_items",
            entityId: id,
            diff: { itemType: { from: before.item_type, to: columns.item_type } },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );

        return updated;
      });

      queueDeployHook("content-block-items:update");
      // D-042: publish by cache invalidation. Runs ALONGSIDE the hook
      // until every consumer reads content at runtime.
      revalidateForReasonDetached("content-block-items:update");
      return respond(row, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

export const deleteBlockItem = (request: Request): Promise<Response> =>
  handle(
    "DELETE /api/admin/content-block-items/{id}",
    async () => {
      const session = await requireAdminMutation(request);
      const id = itemIdFrom(request);

      const before = await queryOne<{ group_key: string }>(
        "SELECT group_key FROM content_block_items WHERE id = $1",
        [id],
      );
      if (!before) throw notFound();

      await transaction(async (client) => {
        await client.query("DELETE FROM content_block_items WHERE id = $1", [id]);

        await audit(
          {
            actorId: session.user.id,
            action: "delete",
            entityType: "content_block_items",
            entityId: id,
            diff: { groupKey: before.group_key },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );
      });

      queueDeployHook("content-block-items:delete");
      // D-042: publish by cache invalidation. Runs ALONGSIDE the hook
      // until every consumer reads content at runtime.
      revalidateForReasonDetached("content-block-items:delete");
      return respond({ ok: true }, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

const itemReorderSchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(200) })
  .strict();

export const reorderBlockItems = (request: Request): Promise<Response> =>
  handle(
    "POST /api/admin/content-block-items/reorder",
    async () => {
      const session = await requireAdminMutation(request);

      const parsed = itemReorderSchema.safeParse(await readBody(request));
      if (!parsed.success) throw unprocessable("`ids` must be a non-empty array of item ids.");

      const ids = parsed.data.ids;
      if (new Set(ids).size !== ids.length) throw unprocessable("`ids` contains duplicates.");

      await transaction(async (client) => {
        const res = await client.query(
          `UPDATE content_block_items AS i SET sort_order = o.position
             FROM (SELECT id, row_number() OVER () AS position
                     FROM unnest($1::uuid[]) AS id) AS o
            WHERE i.id = o.id`,
          [ids],
        );
        if ((res.rowCount ?? 0) !== ids.length) throw notFound();

        await audit(
          {
            actorId: session.user.id,
            action: "reorder",
            entityType: "content_block_items",
            diff: { count: ids.length },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );
      });

      queueDeployHook("content-block-items:reorder");
      // D-042: publish by cache invalidation. Runs ALONGSIDE the hook
      // until every consumer reads content at runtime.
      revalidateForReasonDetached("content-block-items:reorder");
      return respond({ ok: true }, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );
