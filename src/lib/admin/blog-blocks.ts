/**
 * Blog block CRUD — E16. **5 operations across 3 paths.**
 *
 *   GET·POST   /api/admin/posts/{id}/blocks
 *   PATCH·DELETE /api/admin/posts/{id}/blocks/{blockId}
 *   POST       /api/admin/posts/{id}/blocks/reorder
 *
 * ✅ D-022 — a post body is an ORDERED LIST OF TYPED BLOCKS, not a single
 * string. The blog is explicitly not markdown-only.
 *
 * 🔴 This is the one place in the system that accepts markup, so the rules are
 * strict and enforced here rather than at render time:
 *
 *  · `text`/`quote` → sanitised ON WRITE against the allowlist. Raw input is
 *    never stored, so no future consumer has to remember to sanitise.
 *  · `heading`/`list` → PLAIN TEXT. Markup is stripped, not escaped.
 *  · `youtube` → the 11-character ID only. Never a URL, never iframe markup.
 *  · `image` → must reference a PUBLIC `media` row this backend owns. Never a
 *    free-form external URL, and never a private resume.
 */

import { z } from "zod";
import { audit } from "../audit";
import { requireAdmin, requireAdminMutation } from "../auth/guard";
import { query, queryOne, transaction } from "../db";
import { queueDeployHook } from "../deploy-hook";
import { invalidJson, notFound, unprocessable } from "../errors";
import { CACHE_NO_STORE, clientIp, handle, items, readJsonBody, respond } from "../http";
import { plainText, sanitiseHtml } from "../sanitize";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS = `
  id::text AS id, post_id::text AS post_id, sort_order, type::text AS type,
  text_html, heading_level, heading_text, media_id::text AS media_id,
  image_alt, image_caption, youtube_id, youtube_title, list_items,
  created_at, updated_at`;

/**
 * Path shapes:
 *   /api/admin/posts/{postId}/blocks
 *   /api/admin/posts/{postId}/blocks/{blockId}
 *   /api/admin/posts/{postId}/blocks/reorder
 */
function pathIds(request: Request): { postId: string; blockId?: string } {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const blocksAt = segments.lastIndexOf("blocks");

  const postId = decodeURIComponent(segments[blocksAt - 1] ?? "");
  if (!UUID.test(postId)) throw notFound();

  const tail = segments[blocksAt + 1];
  if (tail === undefined || tail === "reorder") return { postId };

  const blockId = decodeURIComponent(tail);
  if (!UUID.test(blockId)) throw notFound();
  return { postId, blockId };
}

async function requirePost(postId: string): Promise<void> {
  const post = await queryOne<{ id: string }>(
    "SELECT id::text AS id FROM blog_posts WHERE id = $1 AND deleted_at IS NULL",
    [postId],
  );
  if (!post) throw notFound();
}

async function readBody(request: Request): Promise<unknown> {
  // A long post body is legitimately large; the cap is still well below
  // anything that would strain the database.
  const body = await readJsonBody(request, 256 * 1024);
  if (body.kind === "too_large") throw unprocessable("Block body is too large.");
  if (body.kind !== "ok") throw invalidJson();
  return body.value;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const blockSchema = z
  .object({
    type: z.enum(["text", "heading", "image", "youtube", "quote", "list"]),
    sortOrder: z.number().int().min(0).max(10_000).optional(),

    /** `text` / `quote`. Sanitised below; never stored as given. */
    textHtml: z.string().max(50_000).optional(),

    /** `heading`. h1 is the post title, so a block heading starts at h2. */
    headingLevel: z.number().int().min(2).max(4).optional(),
    headingText: z.string().max(300).optional(),

    /** `image`. Must be a media row this backend owns. */
    mediaId: z.string().uuid().optional(),
    imageAlt: z.string().max(300).optional(),
    imageCaption: z.string().max(300).optional(),

    /** `youtube`. The ID only. */
    youtubeId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{11}$/, "must be an 11-character YouTube id, not a URL")
      .optional(),
    youtubeTitle: z.string().max(300).optional(),

    /** `list`. Plain strings only. */
    listItems: z.array(z.string().max(2000)).min(1).max(60).optional(),
  })
  .strict();

type BlockInput = z.infer<typeof blockSchema>;

export interface NormalisedBlock {
  columns: Record<string, unknown>;
  /** What the sanitiser removed, so the admin can be told rather than surprised. */
  removed: string[];
}

/**
 * Normalises one block: applies the per-type rules and drops every field that
 * does not belong to its type.
 *
 * Clearing the other columns matters — a block edited from `image` to `text`
 * must not keep a dangling `media_id`, which would make the media library
 * refuse to delete an image nothing displays.
 */
export async function normaliseBlock(input: BlockInput): Promise<NormalisedBlock> {
  const columns: Record<string, unknown> = {
    type: input.type,
    text_html: null,
    heading_level: null,
    heading_text: null,
    media_id: null,
    image_alt: null,
    image_caption: null,
    youtube_id: null,
    youtube_title: null,
    list_items: null,
  };

  if (input.sortOrder !== undefined) columns.sort_order = input.sortOrder;

  const removed: string[] = [];

  switch (input.type) {
    case "text":
    case "quote": {
      if (input.textHtml === undefined || input.textHtml.trim() === "") {
        throw unprocessable(`A ${input.type} block needs some text.`);
      }
      // 🔴 Sanitised ON WRITE. The stored value is already safe, which is what
      // the payload suite asserts against.
      const result = sanitiseHtml(input.textHtml);
      if (result.html.trim() === "") {
        throw unprocessable(
          "After removing unsupported markup there was no text left. Allowed: paragraphs, " +
            "bold, italic, underline, links and lists.",
        );
      }
      columns.text_html = result.html;
      removed.push(...result.removed);
      break;
    }

    case "heading": {
      if (input.headingText === undefined || input.headingText.trim() === "") {
        throw unprocessable("A heading block needs its text.");
      }
      // PLAIN TEXT — markup is stripped, not escaped, so a pasted `<b>` does
      // not become visible angle brackets in a heading.
      columns.heading_text = plainText(input.headingText);
      columns.heading_level = input.headingLevel ?? 2;
      break;
    }

    case "image": {
      if (input.mediaId === undefined) {
        throw unprocessable("An image block needs an image from the media library.");
      }
      if (input.imageAlt === undefined || input.imageAlt.trim() === "") {
        // Required by the table CHECK too; failing here gives a usable message.
        throw unprocessable("An image block needs alt text describing the image.");
      }

      const media = await queryOne<{ visibility: string; resource_type: string }>(
        `SELECT visibility::text AS visibility, resource_type::text AS resource_type
           FROM media WHERE id = $1 AND deleted_at IS NULL`,
        [input.mediaId],
      );

      if (!media) throw unprocessable("That image is not in the media library.");
      // A private resume must never be published in a blog post.
      if (media.visibility !== "public") {
        throw unprocessable("That file is private and cannot be published in a post.");
      }
      if (media.resource_type !== "image") throw unprocessable("That file is not an image.");

      columns.media_id = input.mediaId;
      columns.image_alt = plainText(input.imageAlt);
      columns.image_caption =
        input.imageCaption === undefined ? null : plainText(input.imageCaption);
      break;
    }

    case "youtube": {
      if (input.youtubeId === undefined) {
        throw unprocessable("A video block needs a YouTube id.");
      }
      columns.youtube_id = input.youtubeId;
      columns.youtube_title =
        input.youtubeTitle === undefined ? null : plainText(input.youtubeTitle);
      break;
    }

    case "list": {
      if (input.listItems === undefined) throw unprocessable("A list block needs items.");
      const cleaned = input.listItems.map((i) => plainText(i)).filter((i) => i !== "");
      if (cleaned.length === 0) throw unprocessable("A list block needs at least one item.");
      columns.list_items = JSON.stringify(cleaned);
      break;
    }
  }

  return { columns, removed };
}

// ---------------------------------------------------------------------------
// GET /api/admin/posts/{id}/blocks
// ---------------------------------------------------------------------------

export const listBlocks = (request: Request): Promise<Response> =>
  handle(
    "GET /api/admin/posts/{id}/blocks",
    async () => {
      await requireAdmin();
      const { postId } = pathIds(request);
      await requirePost(postId);

      const rows = await query<Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM blog_post_blocks WHERE post_id = $1
          ORDER BY sort_order, created_at, id`,
        [postId],
      );

      return items(rows, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

// ---------------------------------------------------------------------------
// POST /api/admin/posts/{id}/blocks
// ---------------------------------------------------------------------------

export const createBlock = (request: Request): Promise<Response> =>
  handle(
    "POST /api/admin/posts/{id}/blocks",
    async () => {
      const session = await requireAdminMutation(request);
      const { postId } = pathIds(request);
      await requirePost(postId);

      const parsed = blockSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        throw unprocessable(
          `Invalid block: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }

      const { columns, removed } = await normaliseBlock(parsed.data);

      const row = await transaction(async (client) => {
        // Append by default, so adding a block does not reshuffle the post.
        if (columns.sort_order === undefined) {
          const next = await client.query<{ next: string }>(
            "SELECT coalesce(max(sort_order), 0) + 1 AS next FROM blog_post_blocks WHERE post_id = $1",
            [postId],
          );
          columns.sort_order = Number(next.rows[0]?.next ?? 1);
        }

        columns.post_id = postId;
        const keys = Object.keys(columns);
        const placeholders = keys.map((_, i) => `$${String(i + 1)}`).join(", ");

        const res = await client.query<Record<string, unknown>>(
          `INSERT INTO blog_post_blocks (${keys.join(", ")}) VALUES (${placeholders})
           RETURNING ${COLUMNS}`,
          keys.map((k) => columns[k]),
        );
        const inserted = res.rows[0];
        if (!inserted) throw new Error("INSERT into blog_post_blocks returned no row");

        await audit(
          {
            actorId: session.user.id,
            action: "create",
            entityType: "blog_post_blocks",
            entityId: String(inserted.id),
            // 🔐 The block's TEXT is not recorded — a post body does not belong
            // in the audit trail. Type and what was stripped is what matters.
            diff: { postId, type: columns.type, sanitiserRemoved: removed },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );

        return inserted;
      });

      queueDeployHook("posts:blocks:create");

      return respond(
        // Telling the author what was removed beats silently editing their work.
        { ...row, ...(removed.length > 0 ? { sanitiserRemoved: removed } : {}) },
        { status: 201, admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );

// ---------------------------------------------------------------------------
// PATCH /api/admin/posts/{id}/blocks/{blockId}
// ---------------------------------------------------------------------------

export const updateBlock = (request: Request): Promise<Response> =>
  handle(
    "PATCH /api/admin/posts/{id}/blocks/{blockId}",
    async () => {
      const session = await requireAdminMutation(request);
      const { postId, blockId } = pathIds(request);
      if (blockId === undefined) throw notFound();

      const before = await queryOne<Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM blog_post_blocks WHERE id = $1 AND post_id = $2`,
        [blockId, postId],
      );
      if (!before) throw notFound();

      const parsed = blockSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        throw unprocessable(
          `Invalid block: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }

      // A PATCH here replaces the whole block, because a block's fields depend
      // on its type: merging a partial `image` body onto a `text` block would
      // produce a row that satisfies neither.
      const { columns, removed } = await normaliseBlock(parsed.data);

      const keys = Object.keys(columns);
      const setClause = keys.map((k, i) => `${k} = $${String(i + 3)}`).join(", ");

      const row = await transaction(async (client) => {
        const res = await client.query<Record<string, unknown>>(
          `UPDATE blog_post_blocks SET ${setClause}
            WHERE id = $1 AND post_id = $2 RETURNING ${COLUMNS}`,
          [blockId, postId, ...keys.map((k) => columns[k])],
        );
        const updated = res.rows[0];
        if (!updated) throw notFound();

        await audit(
          {
            actorId: session.user.id,
            action: "update",
            entityType: "blog_post_blocks",
            entityId: blockId,
            diff: {
              postId,
              type: { from: before.type, to: columns.type },
              sanitiserRemoved: removed,
            },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );

        return updated;
      });

      queueDeployHook("posts:blocks:update");

      return respond(
        { ...row, ...(removed.length > 0 ? { sanitiserRemoved: removed } : {}) },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );

// ---------------------------------------------------------------------------
// DELETE /api/admin/posts/{id}/blocks/{blockId}
// ---------------------------------------------------------------------------

export const deleteBlock = (request: Request): Promise<Response> =>
  handle(
    "DELETE /api/admin/posts/{id}/blocks/{blockId}",
    async () => {
      const session = await requireAdminMutation(request);
      const { postId, blockId } = pathIds(request);
      if (blockId === undefined) throw notFound();

      const before = await queryOne<{ type: string }>(
        "SELECT type::text AS type FROM blog_post_blocks WHERE id = $1 AND post_id = $2",
        [blockId, postId],
      );
      if (!before) throw notFound();

      await transaction(async (client) => {
        // A HARD delete, deliberately: a block has no meaning without its post,
        // it references no lead, and the post itself is soft-deleted. Carrying
        // tombstoned blocks would complicate every ordering query for nothing.
        await client.query("DELETE FROM blog_post_blocks WHERE id = $1 AND post_id = $2", [
          blockId,
          postId,
        ]);

        await audit(
          {
            actorId: session.user.id,
            action: "delete",
            entityType: "blog_post_blocks",
            entityId: blockId,
            diff: { postId, type: before.type },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );
      });

      queueDeployHook("posts:blocks:delete");
      return respond({ ok: true }, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );

// ---------------------------------------------------------------------------
// POST /api/admin/posts/{id}/blocks/reorder
// ---------------------------------------------------------------------------

const reorderSchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(200) })
  .strict();

export const reorderBlocks = (request: Request): Promise<Response> =>
  handle(
    "POST /api/admin/posts/{id}/blocks/reorder",
    async () => {
      const session = await requireAdminMutation(request);
      const { postId } = pathIds(request);
      await requirePost(postId);

      const parsed = reorderSchema.safeParse(await readBody(request));
      if (!parsed.success) throw unprocessable("`ids` must be a non-empty array of block ids.");

      const ids = parsed.data.ids;
      if (new Set(ids).size !== ids.length) throw unprocessable("`ids` contains duplicates.");

      await transaction(async (client) => {
        // Scoped to the post, so a block id from another post cannot be moved
        // into this one by a crafted request.
        const res = await client.query(
          `UPDATE blog_post_blocks AS b SET sort_order = o.position
             FROM (SELECT id, row_number() OVER () AS position
                     FROM unnest($1::uuid[]) AS id) AS o
            WHERE b.id = o.id AND b.post_id = $2`,
          [ids, postId],
        );

        if ((res.rowCount ?? 0) !== ids.length) throw notFound();

        await audit(
          {
            actorId: session.user.id,
            action: "reorder",
            entityType: "blog_post_blocks",
            entityId: postId,
            diff: { count: ids.length },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );
      });

      queueDeployHook("posts:blocks:reorder");
      return respond({ ok: true }, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );
