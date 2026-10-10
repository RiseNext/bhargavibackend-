/**
 * Admin CRUD factory — E14's write half.
 *
 * Seven collections × seven operations = **49 operations across 28 paths**:
 *   GET·POST    /{collection}
 *   GET·PATCH·DELETE  /{collection}/{id}
 *   POST        /{collection}/{id}/publish
 *   POST        /{collection}/reorder
 *
 * Writing those out 49 times is how one of them ends up missing CSRF, or the
 * audit row, or the deploy hook. The cross-cutting concerns are therefore
 * defined ONCE here and each collection states only what differs — its table,
 * its field allowlist, and its invariants.
 *
 * Every operation enforced by this factory:
 *  · `requireAdmin()` on reads, `requireAdminMutation()` on writes (both gates)
 *  · a STRICT Zod allowlist, so mass assignment is rejected rather than ignored
 *  · an `audit_log` row inside the same transaction as the mutation
 *  · a queued deploy hook, because content changes reach the public site only
 *    by a rebuild (D-016)
 *  · `{ admin: true }` responses — `no-store, private` + `noindex`
 *  · SOFT delete on content, never a hard one
 *  · 🔴 slug immutability once published — a published slug is a live URL
 */

import { z } from "zod";
import type { PoolClient } from "pg";
import { audit } from "../audit";
import { requireAdmin, requireAdminMutation } from "../auth/guard";
import { query, queryOne, transaction } from "../db";
import { queueDeployHook } from "../deploy-hook";
import { revalidateForReasonDetached } from "../revalidate";
import { conflict, invalidJson, notFound, unprocessable } from "../errors";
import { CACHE_NO_STORE, clientIp, handle, paginated, readJsonBody, respond } from "../http";

/** Admin bodies are larger than public ones — a service body is paragraphs. */
const ADMIN_BODY_LIMIT_BYTES = 256 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CollectionConfig<TCreate, TUpdate> {
  /** URL segment, e.g. `services`. */
  name: string;
  /** Database table. Interpolated from this closed config, never from input. */
  table: string;
  /** Human label for audit diffs and error messages. */
  label: string;

  /** Columns the list and detail endpoints return, as a SELECT fragment. */
  columns: string;

  createSchema: z.ZodType<TCreate>;
  updateSchema: z.ZodType<TUpdate>;

  /** Maps a validated create body to columns. */
  toInsert: (input: TCreate) => Record<string, unknown>;
  /** Maps a validated patch body to columns. Only present keys are written. */
  toUpdate: (input: TUpdate) => Record<string, unknown>;

  /** True when the table has `deleted_at` (content) rather than hard delete. */
  softDelete: boolean;
  /**
   * How publishing is represented.
   *
   * `boolean` — a `published` column. `status` — `blog_posts`, which uses
   * `status` + `published_at` rather than a bare boolean because posts need
   * scheduling and a stable publication date for `BlogPosting` markup. `none` —
   * not publishable.
   */
  publishMode: "boolean" | "status" | "none";
  /** True when the table has `sort_order`. */
  reorderable: boolean;
  /** Column holding an immutable-once-published slug, if any. */
  slugColumn?: string;

  /** Extra invariants, checked before a write. Returns error messages. */
  validate?: (
    input: Record<string, unknown>,
    context: { id?: string },
  ) => Promise<string[]> | string[];

  /** Default ordering for the list. */
  orderBy?: string;
}

/** Builds `SET a = $2, b = $3` plus the matching parameter list. */
function buildSet(
  changes: Record<string, unknown>,
  startIndex: number,
): { clause: string; values: unknown[] } {
  const keys = Object.keys(changes);
  const values: unknown[] = [];
  const parts = keys.map((key, i) => {
    values.push(changes[key]);
    return `${key} = $${String(startIndex + i)}`;
  });
  return { clause: parts.join(", "), values };
}

function idFrom(request: Request, offsetFromEnd = 0): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const id = decodeURIComponent(segments[segments.length - 1 - offsetFromEnd] ?? "");
  // A malformed id is a 404, not a driver error and not a 400 that confirms the
  // route shape.
  if (!UUID.test(id)) throw notFound();
  return id;
}

export interface AdminCrudHandlers {
  list: (request: Request) => Promise<Response>;
  create: (request: Request) => Promise<Response>;
  detail: (request: Request) => Promise<Response>;
  update: (request: Request) => Promise<Response>;
  remove: (request: Request) => Promise<Response>;
  publish: (request: Request) => Promise<Response>;
  reorder: (request: Request) => Promise<Response>;
}

export function createAdminCrud<TCreate, TUpdate>(
  config: CollectionConfig<TCreate, TUpdate>,
): AdminCrudHandlers {
  const { table, name, label } = config;
  
  const order = config.orderBy ?? (config.reorderable ? "sort_order, created_at" : "created_at DESC");

  /** Loads a row for audit-diffing and invariant checks. */
  async function load(id: string, client?: PoolClient): Promise<Record<string, unknown> | undefined> {
    const sql = `SELECT ${config.columns} FROM ${table} WHERE id = $1`;
    if (client) {
      const res = await client.query<Record<string, unknown>>(sql, [id]);
      return res.rows[0];
    }
    return queryOne<Record<string, unknown>>(sql, [id]);
  }

  async function readBody(request: Request): Promise<unknown> {
    const body = await readJsonBody(request, ADMIN_BODY_LIMIT_BYTES);
    if (body.kind === "too_large") throw unprocessable("Request body is too large.");
    if (body.kind !== "ok") throw invalidJson();
    return body.value;
  }

  async function runValidate(
    input: Record<string, unknown>,
    context: { id?: string },
  ): Promise<void> {
    if (!config.validate) return;
    const problems = await config.validate(input, context);
    if (problems.length > 0) throw unprocessable(problems.join(" "));
  }

  // -- GET /{collection} ---------------------------------------------------

  const list = (request: Request): Promise<Response> =>
    handle(
      `GET /api/admin/${name}`,
      async () => {
        await requireAdmin();

        const params = new URL(request.url).searchParams;
        const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
        const limit = Math.min(200, Math.max(1, Number(params.get("limit") ?? "50") || 50));

        const filters: string[] = [];
        const values: unknown[] = [];

        if (config.softDelete) filters.push("deleted_at IS NULL");

        const published = params.get("published");
        if (config.publishMode === "boolean" && (published === "true" || published === "false")) {
          values.push(published === "true");
          filters.push(`published = $${String(values.length)}`);
        }

        const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

        const totals = await query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ${table} ${where}`,
          values,
        );
        const rows = await query<Record<string, unknown>>(
          `SELECT ${config.columns} FROM ${table} ${where}
            ORDER BY ${order}
            LIMIT $${String(values.length + 1)} OFFSET $${String(values.length + 2)}`,
          [...values, limit, (page - 1) * limit],
        );

        return paginated(
          rows,
          { total: Number(totals[0]?.count ?? "0"), page, limit },
          { admin: true, cache: CACHE_NO_STORE },
        );
      },
      { admin: true },
    );

  // -- POST /{collection} --------------------------------------------------

  const create = (request: Request): Promise<Response> =>
    handle(
      `POST /api/admin/${name}`,
      async () => {
        const session = await requireAdminMutation(request);
        const parsed = config.createSchema.safeParse(await readBody(request));

        if (!parsed.success) {
          throw unprocessable(
            `Invalid ${label}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
          );
        }

        const columns = config.toInsert(parsed.data);
        await runValidate(columns, {});

        const keys = Object.keys(columns);
        const placeholders = keys.map((_, i) => `$${String(i + 1)}`).join(", ");

        const row = await transaction(async (client) => {
          let inserted: Record<string, unknown> | undefined;
          try {
            const res = await client.query<Record<string, unknown>>(
              `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})
               RETURNING ${config.columns}`,
              keys.map((k) => columns[k]),
            );
            inserted = res.rows[0];
          } catch (err) {
            const { code, constraint } = err as { code?: string; constraint?: string };
            // A unique violation is the caller's problem, not a 500.
            if (code === "23505") {
              throw conflict(`That ${label} already exists.`, { constraint });
            }
            throw err;
          }

          if (!inserted) throw new Error(`INSERT into ${table} returned no row`);

          await audit(
            {
              actorId: session.user.id,
              action: "create",
              entityType: table,
              entityId: String(inserted.id),
              diff: columns,
              ip: clientIp(request),
              userAgent: request.headers.get("user-agent") ?? undefined,
            },
            client,
          );

          return inserted;
        });

        // Nothing is live until a rebuild, and nothing publishes by default —
        // so this only matters once `published` is set, but queueing here keeps
        // the rule uniform.
        queueDeployHook(`${name}:create`);
        // D-042: publish by cache invalidation. Runs ALONGSIDE the hook
        // until every consumer reads content at runtime.
        revalidateForReasonDetached(`${name}:create`);

        return respond(row, { status: 201, admin: true, cache: CACHE_NO_STORE });
      },
      { admin: true },
    );

  // -- GET /{collection}/{id} ---------------------------------------------

  const detail = (request: Request): Promise<Response> =>
    handle(
      `GET /api/admin/${name}/{id}`,
      async () => {
        await requireAdmin();
        const row = await load(idFrom(request));
        if (!row) throw notFound();
        return respond(row, { admin: true, cache: CACHE_NO_STORE });
      },
      { admin: true },
    );

  // -- PATCH /{collection}/{id} -------------------------------------------

  const update = (request: Request): Promise<Response> =>
    handle(
      `PATCH /api/admin/${name}/{id}`,
      async () => {
        const session = await requireAdminMutation(request);
        const id = idFrom(request);

        const parsed = config.updateSchema.safeParse(await readBody(request));
        if (!parsed.success) {
          throw unprocessable(
            `Invalid ${label}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
          );
        }

        const changes = config.toUpdate(parsed.data);
        if (Object.keys(changes).length === 0) throw unprocessable("Nothing to change.");

        const before = await load(id);
        if (!before) throw notFound();

        // 🔴 A published slug is a LIVE URL. Changing it 404s a page that search
        // engines and patients already have, and loses its ranking. Immutable
        // once published, enforced here rather than only in the admin form.
        if (config.slugColumn && changes[config.slugColumn] !== undefined) {
          const isPublished = before.published === true || before.status === "published";
          if (isPublished && changes[config.slugColumn] !== before[config.slugColumn]) {
            throw conflict(
              `The slug of a published ${label} cannot be changed — it is a live URL. ` +
                "Unpublish it first if the URL really must change, and set up a redirect.",
            );
          }
        }

        await runValidate(changes, { id });

        const { clause, values } = buildSet(changes, 2);

        const row = await transaction(async (client) => {
          let updated: Record<string, unknown> | undefined;
          try {
            const res = await client.query<Record<string, unknown>>(
              `UPDATE ${table} SET ${clause} WHERE id = $1 RETURNING ${config.columns}`,
              [id, ...values],
            );
            updated = res.rows[0];
          } catch (err) {
            const { code, constraint } = err as { code?: string; constraint?: string };
            if (code === "23505") throw conflict(`That ${label} already exists.`, { constraint });
            throw err;
          }

          if (!updated) throw notFound();

          // Only the fields that actually changed, with their previous values —
          // a full row dump would bloat the trail and risk carrying content the
          // audit log should not hold.
          const diff: Record<string, unknown> = {};
          for (const key of Object.keys(changes)) {
            diff[key] = { from: before[key], to: changes[key] };
          }

          await audit(
            {
              actorId: session.user.id,
              action: "update",
              entityType: table,
              entityId: id,
              diff,
              ip: clientIp(request),
              userAgent: request.headers.get("user-agent") ?? undefined,
            },
            client,
          );

          return updated;
        });

        queueDeployHook(`${name}:update`);
        // D-042: publish by cache invalidation. Runs ALONGSIDE the hook
        // until every consumer reads content at runtime.
        revalidateForReasonDetached(`${name}:update`);
        return respond(row, { admin: true, cache: CACHE_NO_STORE });
      },
      { admin: true },
    );

  // -- DELETE /{collection}/{id} ------------------------------------------

  const remove = (request: Request): Promise<Response> =>
    handle(
      `DELETE /api/admin/${name}/{id}`,
      async () => {
        const session = await requireAdminMutation(request);
        const id = idFrom(request);

        const before = await load(id);
        if (!before) throw notFound();

        await transaction(async (client) => {
          if (config.softDelete) {
            // SOFT delete: content edits must be recoverable, and a hard delete
            // would also break any lead that references this row.
            await client.query(
              `UPDATE ${table} SET deleted_at = now()${config.publishMode === "boolean" ? ", published = false" : config.publishMode === "status" ? ", status = 'draft'" : ""} WHERE id = $1`,
              [id],
            );
          } else {
            await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
          }

          await audit(
            {
              actorId: session.user.id,
              action: "delete",
              entityType: table,
              entityId: id,
              diff: { soft: config.softDelete, slug: before[config.slugColumn ?? "id"] },
              ip: clientIp(request),
              userAgent: request.headers.get("user-agent") ?? undefined,
            },
            client,
          );
        });

        queueDeployHook(`${name}:delete`);
        // D-042: publish by cache invalidation. Runs ALONGSIDE the hook
        // until every consumer reads content at runtime.
        revalidateForReasonDetached(`${name}:delete`);
        return respond({ ok: true }, { admin: true, cache: CACHE_NO_STORE });
      },
      { admin: true },
    );

  // -- POST /{collection}/{id}/publish ------------------------------------

  const publishSchema = z.object({ published: z.boolean() }).strict();

  const publish = (request: Request): Promise<Response> =>
    handle(
      `POST /api/admin/${name}/{id}/publish`,
      async () => {
        const session = await requireAdminMutation(request);
        if (config.publishMode === "none") throw notFound();

        // The id is the second-to-last segment, before `publish`.
        const id = idFrom(request, 1);

        const parsed = publishSchema.safeParse(await readBody(request));
        if (!parsed.success) throw unprocessable("`published` must be true or false.");

        const before = await load(id);
        if (!before) throw notFound();

        // 🔴 The publish toggle is a MUTATION and must honour the collection's
        // invariants. It did not: `validate` ran on create and PATCH but not
        // here, so an invariant expressed as "you may not unpublish this" was
        // enforceable through the form and bypassable through this endpoint.
        // Every current `validate` is a no-op when handed only `published`, so
        // routing the toggle through the same gate adds the check without
        // changing any existing behaviour.
        await runValidate({ published: parsed.data.published }, { id });

        const row = await transaction(async (client) => {
          const sql =
            config.publishMode === "status"
              ? // `published_at` is set on first publish and KEPT thereafter:
                // BlogPosting markup and the sitemap both need a stable
                // publication date, so re-publishing must not move it.
                `UPDATE ${table}
                    SET status = CASE WHEN $2 THEN 'published'::blog_status ELSE 'draft'::blog_status END,
                        published_at = CASE
                          WHEN $2 AND published_at IS NULL THEN now()
                          WHEN $2 THEN published_at
                          ELSE published_at
                        END
                  WHERE id = $1 RETURNING ${config.columns}`
              : `UPDATE ${table} SET published = $2 WHERE id = $1 RETURNING ${config.columns}`;

          const res = await client.query<Record<string, unknown>>(sql, [id, parsed.data.published]);
          const updated = res.rows[0];
          if (!updated) throw notFound();

          await audit(
            {
              actorId: session.user.id,
              action: parsed.data.published ? "publish" : "unpublish",
              entityType: table,
              entityId: id,
              diff: {
                from: before.published ?? before.status,
                to: parsed.data.published,
              },
              ip: clientIp(request),
              userAgent: request.headers.get("user-agent") ?? undefined,
            },
            client,
          );

          return updated;
        });

        queueDeployHook(`${name}:publish`);
        // D-042: publish by cache invalidation. Runs ALONGSIDE the hook
        // until every consumer reads content at runtime.
        revalidateForReasonDetached(`${name}:publish`);
        return respond(row, { admin: true, cache: CACHE_NO_STORE });
      },
      { admin: true },
    );

  // -- POST /{collection}/reorder -----------------------------------------

  const reorderSchema = z
    .object({ ids: z.array(z.string().uuid()).min(1).max(500) })
    .strict();

  const reorder = (request: Request): Promise<Response> =>
    handle(
      `POST /api/admin/${name}/reorder`,
      async () => {
        const session = await requireAdminMutation(request);
        if (!config.reorderable) throw notFound();

        const parsed = reorderSchema.safeParse(await readBody(request));
        if (!parsed.success) throw unprocessable("`ids` must be a non-empty array of row ids.");

        const ids = parsed.data.ids;
        if (new Set(ids).size !== ids.length) {
          throw unprocessable("`ids` contains duplicates.");
        }

        await transaction(async (client) => {
          // One statement with `unnest`, so the whole reorder is atomic. Issuing
          // N updates would leave a visibly half-reordered list if one failed.
          const res = await client.query(
            `UPDATE ${table} AS t
                SET sort_order = o.position
               FROM (SELECT id, row_number() OVER () AS position
                       FROM unnest($1::uuid[]) AS id) AS o
              WHERE t.id = o.id`,
            [ids],
          );

          if ((res.rowCount ?? 0) !== ids.length) {
            // A caller reordering rows that do not exist has a stale list;
            // applying it partially would scramble the real order.
            throw notFound();
          }

          await audit(
            {
              actorId: session.user.id,
              action: "reorder",
              entityType: table,
              diff: { count: ids.length },
              ip: clientIp(request),
              userAgent: request.headers.get("user-agent") ?? undefined,
            },
            client,
          );
        });

        queueDeployHook(`${name}:reorder`);
        // D-042: publish by cache invalidation. Runs ALONGSIDE the hook
        // until every consumer reads content at runtime.
        revalidateForReasonDetached(`${name}:reorder`);
        return respond({ ok: true }, { admin: true, cache: CACHE_NO_STORE });
      },
      { admin: true },
    );

  return { list, create, detail, update, remove, publish, reorder };
}

export { ADMIN_BODY_LIMIT_BYTES };
