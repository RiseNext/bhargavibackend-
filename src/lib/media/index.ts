/**
 * The `media` table — rows describing assets that live in Cloudinary.
 *
 * A row is only ever written AFTER the asset has been verified through the
 * Admin API (D-014). The upload response from the browser is never the record.
 */

import { query, queryOne } from "../db";
import type { AdminResource } from "../cloudinary/upload";

export interface MediaRow {
  id: string;
  publicId: string;
  resourceType: "image" | "raw";
  deliveryType: "upload" | "authenticated";
  visibility: "public" | "private";
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  /** 🔴 NULL for private assets — see `insertMedia`. */
  secureUrl: string | null;
  version: string | null;
  altDefault: string | null;
  folder: string | null;
  createdAt: string;
}

interface RawMediaRow {
  id: string;
  public_id: string;
  resource_type: "image" | "raw";
  delivery_type: "upload" | "authenticated";
  visibility: "public" | "private";
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  secure_url: string | null;
  version: string | null;
  alt_default: string | null;
  folder: string | null;
  created_at: Date;
}

const SELECT = `id::text AS id, public_id, resource_type, delivery_type, visibility,
                format, bytes, width, height, secure_url, version, alt_default, folder,
                created_at`;

function toRow(r: RawMediaRow): MediaRow {
  return {
    id: r.id,
    publicId: r.public_id,
    resourceType: r.resource_type,
    deliveryType: r.delivery_type,
    visibility: r.visibility,
    format: r.format,
    bytes: r.bytes,
    width: r.width,
    height: r.height,
    secureUrl: r.secure_url,
    version: r.version,
    altDefault: r.alt_default,
    folder: r.folder,
    createdAt: r.created_at.toISOString(),
  };
}

export interface InsertMediaInput {
  publicId: string;
  resourceType: "image" | "raw";
  deliveryType: "upload" | "authenticated";
  visibility: "public" | "private";
  format: string;
  resource: AdminResource;
  altDefault?: string | null;
  folder?: string | null;
  uploadedBy?: string | null;
}

/**
 * Records a verified asset.
 *
 * 🔴 `secure_url` is stored ONLY for public assets. The migration enforces the
 * same rule with a CHECK (`visibility = 'public' OR secure_url IS NULL`): a
 * stored URL for a private asset is a durable, copy-pasteable handle to
 * somebody's CV, and it would outlive any signed-URL expiry.
 */
export async function insertMedia(input: InsertMediaInput): Promise<MediaRow> {
  const isPublic = input.visibility === "public";
  const r = input.resource;

  const row = await queryOne<RawMediaRow>(
    `INSERT INTO media (
       provider, public_id, resource_type, delivery_type, visibility,
       format, bytes, width, height, secure_url, version, etag,
       original_filename, alt_default, folder, uploaded_by
     ) VALUES ('cloudinary',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING ${SELECT}`,
    [
      input.publicId,
      input.resourceType,
      input.deliveryType,
      input.visibility,
      input.format,
      r.bytes ?? 0,
      r.width ?? null,
      r.height ?? null,
      isPublic ? (r.secure_url ?? null) : null,
      r.version === undefined ? null : String(r.version),
      r.etag ?? null,
      r.original_filename ?? null,
      input.altDefault ?? null,
      input.folder ?? null,
      input.uploadedBy ?? null,
    ],
  );

  if (!row) throw new Error("media insert returned no row");
  return toRow(row);
}

export async function findMediaById(id: string): Promise<MediaRow | undefined> {
  const row = await queryOne<RawMediaRow>(
    `SELECT ${SELECT} FROM media WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return row ? toRow(row) : undefined;
}

export interface ListMediaQuery {
  limit: number;
  offset: number;
  visibility?: "public" | "private";
  resourceType?: "image" | "raw";
}

/**
 * The admin media library.
 *
 * 🔴 Private assets are LISTED (an administrator has to be able to see that a
 * resume exists) but carry no URL — `secure_url` is NULL for them by
 * construction, and retrieval goes through the audited signed-url endpoint.
 */
export async function listMedia(
  q: ListMediaQuery,
): Promise<{ rows: MediaRow[]; total: number }> {
  const where: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];

  if (q.visibility) {
    params.push(q.visibility);
    where.push(`visibility = $${String(params.length)}`);
  }
  if (q.resourceType) {
    params.push(q.resourceType);
    where.push(`resource_type = $${String(params.length)}`);
  }

  const clause = where.join(" AND ");
  const counted = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM media WHERE ${clause}`,
    params,
  );

  params.push(q.limit, q.offset);
  const rows = await query<RawMediaRow>(
    `SELECT ${SELECT} FROM media WHERE ${clause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${String(params.length - 1)} OFFSET $${String(params.length)}`,
    params,
  );

  return { rows: rows.map(toRow), total: Number(counted?.n ?? "0") };
}

/**
 * Soft-deletes a media row.
 *
 * Soft, because `services.image_media_id` and friends reference it: a hard
 * delete would either cascade a service's image away or fail on the FK. The
 * Cloudinary asset is destroyed separately by the caller.
 */
export async function softDeleteMedia(id: string): Promise<MediaRow | undefined> {
  const row = await queryOne<RawMediaRow>(
    `UPDATE media SET deleted_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING ${SELECT}`,
    [id],
  );
  return row ? toRow(row) : undefined;
}

/** Rows that still point at a media asset, so a delete can refuse to orphan one. */
/**
 * Every column in the schema that references `media(id)` — ALL THIRTEEN.
 *
 * 🔴 WHY THIS MUST BE EXHAUSTIVE. Deletion here is a SOFT delete plus an
 * IRREVERSIBLE Cloudinary `destroy`. Because the row is never actually deleted,
 * the `ON DELETE RESTRICT` / `SET NULL` actions declared in the migrations never
 * fire — so the database cannot catch an in-use asset and this list is the ONLY
 * protection. This function previously named just five columns, which meant the
 * founder photo, the logos, every Open Graph image, the blog cover and every
 * blog image block all reported "unreferenced" and could be destroyed while
 * still rendering on the live site.
 *
 * Grouped by the surface an editor would recognise, because the message is
 * shown to them; `site_settings` is one row, so its four columns are reported
 * as one surface rather than four.
 *
 * ⚠ `tests/media-references.test.ts` asserts this list against
 * `information_schema` and FAILS if a migration adds a referencing column that
 * is not covered here. Add the column in both places, or the test will say so.
 */
const MEDIA_REFERENCE_SOURCES = [
  { label: "services (image)", sql: "SELECT count(*)::text AS n FROM services WHERE image_media_id = $1" },
  { label: "services (social image)", sql: "SELECT count(*)::text AS n FROM services WHERE og_media_id = $1" },
  { label: "gallery", sql: "SELECT count(*)::text AS n FROM gallery_images WHERE media_id = $1" },
  { label: "list items (icon)", sql: "SELECT count(*)::text AS n FROM content_list_items WHERE icon_media_id = $1" },
  { label: "page sections", sql: "SELECT count(*)::text AS n FROM content_block_items WHERE media_id = $1" },
  { label: "page metadata (social image)", sql: "SELECT count(*)::text AS n FROM page_meta WHERE og_media_id = $1" },
  { label: "blog posts (cover)", sql: "SELECT count(*)::text AS n FROM blog_posts WHERE cover_media_id = $1" },
  { label: "blog post content", sql: "SELECT count(*)::text AS n FROM blog_post_blocks WHERE media_id = $1" },
  { label: "job applications (CV)", sql: "SELECT count(*)::text AS n FROM applications WHERE resume_media_id = $1" },
  {
    // One row, four columns — reported once so the message stays readable.
    label: "site settings (logo / founder photo / social image)",
    sql: `SELECT count(*)::text AS n FROM site_settings
           WHERE logo_media_id = $1
              OR logo_lockup_media_id = $1
              OR founder_photo_media_id = $1
              OR og_media_id = $1`,
  },
] as const;

/** The columns the list above covers, for the drift test to compare against. */
export const MEDIA_REFERENCING_COLUMNS: ReadonlyArray<`${string}.${string}`> = [
  "applications.resume_media_id",
  "blog_post_blocks.media_id",
  "blog_posts.cover_media_id",
  "content_block_items.media_id",
  "content_list_items.icon_media_id",
  "gallery_images.media_id",
  "page_meta.og_media_id",
  "services.image_media_id",
  "services.og_media_id",
  "site_settings.founder_photo_media_id",
  "site_settings.logo_lockup_media_id",
  "site_settings.logo_media_id",
  "site_settings.og_media_id",
];

export async function mediaReferences(id: string): Promise<string[]> {
  // Deliberately one UNION ALL query rather than ten round trips: a delete must
  // see a single consistent snapshot, or a reference created between two
  // separate reads would be missed.
  const combined = MEDIA_REFERENCE_SOURCES.map(
    (s, i) => `SELECT '${String(i)}' AS idx, n FROM (${s.sql}) AS s${String(i)}`,
  ).join(" UNION ALL ");

  const rows = await query<{ idx: string; n: string }>(combined, [id]);

  return rows
    .filter((r) => Number(r.n) > 0)
    .map((r) => {
      const source = MEDIA_REFERENCE_SOURCES[Number(r.idx)];
      return `${source?.label ?? "unknown"} (${r.n})`;
    });
}
