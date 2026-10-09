/**
 * Content index — every collection the clinic can edit.
 *
 * Shows live and unpublished counts side by side, because `published` defaults
 * to false: content can be created and then invisibly never go live, which is
 * the one failure an index page is well placed to surface.
 */

import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guard";
import { query } from "@/lib/db";
import { COLLECTION_UI } from "@/lib/admin/ui-schema";

export const dynamic = "force-dynamic";

/** slug → [table, uses a `published` boolean rather than a `status` enum]. */
const SOURCES: ReadonlyArray<readonly [string, string, boolean]> = [
  ["services", "services", true],
  ["testimonials", "testimonials", true],
  ["videos", "videos", true],
  ["gallery", "gallery_images", true],
  ["faqs", "faqs", true],
  ["jobs", "jobs", true],
  ["posts", "blog_posts", false],
  ["stats", "stats", true],
  ["social-links", "social_links", true],
  ["content-lists", "content_list_items", true],
];

interface Count {
  total: number;
  unpublished: number;
}

export default async function ContentIndexPage() {
  await requireAdminPage("/admin/content");

  const counts: Record<string, Count> = {};

  for (const [slug, table, hasPublished] of SOURCES) {
    const unpublishedExpression = hasPublished
      ? "count(*) FILTER (WHERE NOT published)::text"
      : "count(*) FILTER (WHERE status <> 'published')::text";

    try {
      const rows = await query<{ total: string; unpublished: string }>(
        `SELECT count(*)::text AS total, ${unpublishedExpression} AS unpublished FROM ${table}`,
      );
      counts[slug] = {
        total: Number(rows[0]?.total ?? "0"),
        unpublished: Number(rows[0]?.unpublished ?? "0"),
      };
    } catch {
      // A single failed count must not blank the whole index — the card simply
      // says the count is unavailable.
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 20, marginTop: 0 }}>Content</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
        Everything a visitor reads. Saving a change queues a site rebuild, so it appears live a
        couple of minutes later.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 14,
          marginTop: 18,
        }}
      >
        {Object.values(COLLECTION_UI).map((ui) => {
          const count = counts[ui.slug];

          return (
            <Link
              key={ui.slug}
              href={`/admin/content/${ui.slug}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: 14,
                  height: "100%",
                }}
              >
                <strong style={{ fontSize: 15 }}>{ui.title}</strong>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                  {count === undefined
                    ? "count unavailable"
                    : `${String(count.total)} item${count.total === 1 ? "" : "s"}`}
                  {count !== undefined && count.unpublished > 0 && (
                    <span style={{ color: "var(--warn)" }}>
                      {` · ${String(count.unpublished)} not live`}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <h2 style={{ fontSize: 16, marginTop: 30 }}>Also editable</h2>
      <ul style={{ fontSize: 14, paddingLeft: 18 }}>
        <li>
          <Link href="/admin/branches">Branches</Link> — addresses, phones, hours and the two
          orderings
        </li>
        <li>
          <Link href="/admin/settings">Site settings</Link> — business details, founder, brand and
          SEO defaults
        </li>
        <li>
          <Link href="/admin/page-copy">Page copy</Link> — the headings and section text on every
          page
        </li>
      </ul>
    </>
  );
}
