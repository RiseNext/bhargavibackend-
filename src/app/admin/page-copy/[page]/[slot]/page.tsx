/**
 * Page-copy slot editor.
 *
 * The page-copy index has always linked here for every one of the 41 slots, but
 * this route did not exist, so all 41 links answered 404 — none of the site's
 * headings or section text was editable, which CLAUDE.md §9 requires.
 *
 * Read server-side from the table and written through
 * `PUT /api/admin/content-blocks/{page}/{slot}`.
 *
 * 🔴 A slot can be edited but never created or deleted here. Slots correspond to
 * real sections the frontend renders and the list is derived from the content
 * snapshot (D-037): inventing one produces content nobody can see, deleting one
 * blanks a live section.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guard";
import { query, queryOne } from "@/lib/db";
import { allowedExtraKeys } from "@/lib/content/extra-allowlist";
// 🔴 TYPES ONLY besides the component. Calling a function exported from a
// `"use client"` module is what broke the service editor in production; this
// route had the identical defect and would have thrown the same way the moment
// anyone opened a slot with images — the homepage hero included.
import ImageCollectionEditor, {
  type CollectionTarget,
  type SlideRow,
} from "../../../_components/ImageCollectionEditor";
import SlotForm, { type SlotRow } from "./SlotForm";

export const dynamic = "force-dynamic";

const KEY = /^[a-zA-Z][a-zA-Z0-9]*$/;

interface Row {
  id: string;
  page: string;
  slot: string;
  label: string | null;
  title: string | null;
  lead: string | null;
  body: string[] | null;
  cta_label: string | null;
  cta_href: string | null;
  cta2_label: string | null;
  cta2_href: string | null;
  extra: Record<string, unknown> | null;
}

/**
 * 🔴 THE SLOT'S IMAGE ROWS — the homepage hero photograph among them.
 *
 * WHAT WAS MISSING. This screen read only the scalar columns of
 * `content_blocks`, so the `content_block_items` rows were invisible here. The
 * home hero's photograph is one of those rows (`home.hero`, group `images` —
 * D-027, widened to a collection by D-044), which meant the single most
 * prominent image on the website could not be changed from the admin panel at
 * all. Everything underneath it already worked: the table, `media_id`, `alt`,
 * `sort_order`, the `is_default` column migration 017 added, and the full
 * create/update/delete/reorder API. Only the screen was absent.
 *
 * Grouped by `group_key` because a slot may hold several independent lists —
 * `images`, `rows`, `bulletList` — and each is its own ordered collection with
 * its own main image.
 *
 * ⚠ IMAGE GROUPS ONLY. A `text` or `label_value` item is edited as copy, not
 * as a picture, and handing it to an image editor would offer an upload for a
 * row that has no `media_id`.
 */
async function loadImageGroups(blockId: string): Promise<Array<{ key: string; rows: SlideRow[] }>> {
  const rows = await query<{
    id: string;
    group_key: string;
    media_id: string | null;
    alt: string | null;
    sort_order: number;
    is_default: boolean;
    secure_url: string | null;
  }>(
    `SELECT i.id::text AS id, i.group_key, i.media_id::text AS media_id, i.alt,
            i.sort_order, i.is_default, m.secure_url
       FROM content_block_items i
       LEFT JOIN media m ON m.id = i.media_id
      WHERE i.block_id = $1 AND i.item_type = 'image'
      ORDER BY i.group_key, i.sort_order, i.id`,
    [blockId],
  );

  const groups = new Map<string, SlideRow[]>();
  for (const r of rows) {
    // A row with no media cannot be previewed, reordered meaningfully or made
    // the main image, so it is not offered here — the copy editor owns it.
    if (r.media_id === null) continue;
    const list = groups.get(r.group_key) ?? [];
    list.push({
      id: r.id,
      mediaId: r.media_id,
      alt: r.alt ?? "",
      sortOrder: r.sort_order,
      isDefault: r.is_default,
      secureUrl: r.secure_url,
    });
    groups.set(r.group_key, list);
  }

  return [...groups].map(([key, list]) => ({ key, rows: list }));
}

export default async function SlotEditPage({
  params,
}: {
  params: Promise<{ page: string; slot: string }>;
}) {
  await requireAdminPage();

  const { page, slot } = await params;
  if (!KEY.test(page) || !KEY.test(slot)) notFound();

  const row = await queryOne<Row>(
    `SELECT id::text AS id, page, slot, label, title, lead, body,
            cta_label, cta_href, cta2_label, cta2_href, extra
       FROM content_blocks
      WHERE page = $1 AND slot = $2`,
    [page, slot],
  );
  if (!row) notFound();

  const imageGroups = await loadImageGroups(row.id);

  // snake_case in the database, camelCase over the wire — the same boundary
  // rule the API follows, applied here so the form speaks one language.
  const shaped: SlotRow = {
    page: row.page,
    slot: row.slot,
    label: row.label,
    title: row.title,
    lead: row.lead,
    body: row.body,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    cta2Label: row.cta2_label,
    cta2Href: row.cta2_href,
    extra: row.extra,
  };

  return (
    <>
      <p style={{ fontSize: 13, marginTop: 0 }}>
        <Link href="/admin/page-copy">← Page copy</Link>
      </p>

      <h1 style={{ fontSize: 20, marginTop: 0 }}>{row.slot}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
        Section on <strong>{row.page}</strong>. Only the text changes here — the layout and design
        are fixed.
      </p>

      <SlotForm row={shaped} allowedExtraKeys={allowedExtraKeys(page, slot)} />

      {imageGroups.map((group) => (
        <ImageCollectionEditor
          key={group.key}
          rows={group.rows}
          target={
            { kind: "blockItem", blockId: row.id, groupKey: group.key } satisfies CollectionTarget
          }
          heading={
            group.rows.length > 1 ? `Images — ${group.key}` : `Image — ${group.key}`
          }
          emptyHint="No images in this group yet. Add one below."
          description={
            <>
              The photographs this section shows, in the order below. The main image is the one it
              opens on; with several images the section becomes a slideshow.{" "}
              <strong>
                A change here reaches the public website after a site rebuild, which this save
                queues automatically — allow a couple of minutes.
              </strong>
            </>
          }
          altPlaceholder="e.g. A patient receiving acupuncture at the clinic"
        />
      ))}
    </>
  );
}
