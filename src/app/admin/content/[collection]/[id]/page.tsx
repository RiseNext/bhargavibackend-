/**
 * Record edit / create screen — one route for all ten collections.
 *
 * `/new` creates; a UUID edits. The form itself calls the admin API, so this
 * page only loads the row and the descriptor.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guard";
import { query, queryOne } from "@/lib/db";
import { collectionUi } from "@/lib/admin/ui-schema";
import RecordForm, { type DynamicOptions } from "../../../_components/RecordForm";

export const dynamic = "force-dynamic";

/** Closed map; the segment is never interpolated into SQL. */
const TABLES: Record<string, string> = {
  services: "services",
  testimonials: "testimonials",
  videos: "videos",
  gallery: "gallery_images",
  faqs: "faqs",
  jobs: "jobs",
  posts: "blog_posts",
  stats: "stats",
  "social-links": "social_links",
  "content-lists": "content_list_items",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RecordPage({
  params,
}: {
  params: Promise<{ collection: string; id: string }>;
}) {
  await requireAdminPage();

  const { collection, id } = await params;
  const ui = collectionUi(collection);
  const table = TABLES[collection];
  if (!ui || !table) notFound();

  const isNew = id === "new";
  if (!isNew && !UUID.test(id)) notFound();

  const row = isNew
    ? undefined
    : await queryOne<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = $1`, [id]);

  if (!isNew && !row) notFound();

  const dynamicOptions = await resolveDynamicOptions(ui.fields);

  return (
    <>
      <p style={{ fontSize: 13 }}>
        <Link href={`/admin/content/${collection}`}>← {ui.title}</Link>
      </p>

      <h1 style={{ fontSize: 20, marginTop: 0 }}>
        {isNew ? `New ${ui.title.replace(/s$/, "").toLowerCase()}` : displayName(row)}
      </h1>

      <RecordForm
        ui={ui}
        {...(row ? { row } : {})}
        {...(isNew ? {} : { id })}
        {...(dynamicOptions ? { dynamicOptions } : {})}
      />

      {collection === "posts" && !isNew && (
        <p style={{ marginTop: 24, fontSize: 14 }}>
          <Link href={`/admin/content/posts/${id}/blocks`}>Edit this post&apos;s content blocks →</Link>
        </p>
      )}
    </>
  );
}

/**
 * Turns a field's `optionsFrom` key into real options.
 *
 * Done here, on the server, rather than with a fetch from the form: this screen
 * already has database access, so the branch list arrives with the first paint
 * instead of popping in afterwards, and the form component stays free of a
 * second loading state.
 *
 * Only the keys actually used by this collection are queried.
 */
async function resolveDynamicOptions(
  fields: ReadonlyArray<{ optionsFrom?: "branches" }>,
): Promise<DynamicOptions | undefined> {
  const needed = new Set(
    fields.map((f) => f.optionsFrom).filter((k): k is "branches" => k !== undefined),
  );
  if (needed.size === 0) return undefined;

  const out: DynamicOptions = {};

  if (needed.has("branches")) {
    // 🔴 `sort_order`, never `is_primary` (D-029). Inactive branches are left
    // out of the choices but an already-saved one still renders, flagged, so a
    // deactivation cannot silently rewrite an existing job.
    const rows = await query<{ id: string; name: string }>(
      `SELECT id::text AS id, name
         FROM branches
        WHERE is_active
        ORDER BY sort_order, name`,
    );
    out.branches = rows.map((r) => ({ value: r.id, label: r.name }));
  }

  return out;
}

function displayName(row: Record<string, unknown> | undefined): string {
  if (!row) return "Record";
  for (const key of ["title", "question", "label", "platform", "author_name", "alt"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return "Record";
}
