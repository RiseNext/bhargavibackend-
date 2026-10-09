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
import { queryOne } from "@/lib/db";
import { allowedExtraKeys } from "@/lib/content/extra-allowlist";
import SlotForm, { type SlotRow } from "./SlotForm";

export const dynamic = "force-dynamic";

const KEY = /^[a-zA-Z][a-zA-Z0-9]*$/;

interface Row {
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

export default async function SlotEditPage({
  params,
}: {
  params: Promise<{ page: string; slot: string }>;
}) {
  await requireAdminPage();

  const { page, slot } = await params;
  if (!KEY.test(page) || !KEY.test(slot)) notFound();

  const row = await queryOne<Row>(
    `SELECT page, slot, label, title, lead, body,
            cta_label, cta_href, cta2_label, cta2_href, extra
       FROM content_blocks
      WHERE page = $1 AND slot = $2`,
    [page, slot],
  );
  if (!row) notFound();

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
    </>
  );
}
