/**
 * Collection list screen — one route for all ten content collections.
 *
 * 🔴 Three distinguishable states, as the blueprint requires: genuinely empty,
 * a filter that matched nothing, and a failed query. Rendering "nothing here"
 * when the database is down is how a clinic concludes its content has vanished.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guard";
import { query } from "@/lib/db";
import { collectionUi, rupeesFromPaise } from "@/lib/admin/ui-schema";
import ReorderButtons from "../../_components/ReorderButtons";

export const dynamic = "force-dynamic";

/**
 * The table each collection slug reads from. A closed map, never user input.
 *
 * `groupBy` names the column a row may only be reordered WITHIN. Only
 * `content_list_items` has one: it is ordered `collection, sort_order`, so
 * moving a "why choose us" item past a "process" item would be meaningless.
 */
const TABLES: Record<
  string,
  { table: string; soft: boolean; order: string; groupBy?: string }
> = {
  services: { table: "services", soft: true, order: "sort_order, created_at" },
  testimonials: { table: "testimonials", soft: true, order: "sort_order, created_at" },
  videos: { table: "videos", soft: true, order: "sort_order, created_at" },
  gallery: { table: "gallery_images", soft: true, order: "sort_order, created_at" },
  faqs: { table: "faqs", soft: true, order: "sort_order, created_at" },
  jobs: { table: "jobs", soft: true, order: "sort_order, created_at" },
  posts: { table: "blog_posts", soft: true, order: "coalesce(published_at, created_at) DESC" },
  stats: { table: "stats", soft: false, order: "sort_order, created_at" },
  "social-links": { table: "social_links", soft: false, order: "sort_order, platform" },
  "content-lists": {
    table: "content_list_items",
    soft: false,
    order: "collection, sort_order",
    groupBy: "collection",
  },
};

interface Params {
  collection: string;
}

export default async function CollectionListPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ published?: string }>;
}) {
  await requireAdminPage();

  const { collection } = await params;
  const ui = collectionUi(collection);
  const source = TABLES[collection];
  if (!ui || !source) notFound();

  const { published } = await searchParams;
  const filtering = published === "true" || published === "false";

  const filters: string[] = [];
  if (source.soft) filters.push("deleted_at IS NULL");
  if (filtering && ui.canPublish) filters.push(`published = ${published === "true" ? "true" : "false"}`);
  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  let rows: Array<Record<string, unknown>> = [];
  let failed = false;

  try {
    rows = await query<Record<string, unknown>>(
      `SELECT * FROM ${source.table} ${where} ORDER BY ${source.order} LIMIT 300`,
    );
  } catch {
    failed = true;
  }

  /**
   * 🔴 Reordering is offered only on the UNFILTERED list.
   *
   * The reorder endpoint renumbers exactly the ids it is sent. On a filtered
   * view the visible rows are a subset, so moving one would renumber the subset
   * and silently scramble its order relative to every hidden row. Showing the
   * controls and quietly doing the wrong thing is worse than not showing them.
   */
  const canReorderHere = ui.canReorder && !filtering && !failed && rows.length > 1;

  /**
   * Each row's peer group, in display order. A row may only move within the
   * group it is ordered inside — see `groupBy`.
   */
  const peers = new Map<string, string[]>();
  if (canReorderHere) {
    for (const row of rows) {
      const key = source.groupBy === undefined ? "" : String(row[source.groupBy] ?? "");
      const list = peers.get(key) ?? [];
      list.push(String(row.id));
      peers.set(key, list);
    }
  }
  const groupOf = (row: Record<string, unknown>): string =>
    source.groupBy === undefined ? "" : String(row[source.groupBy] ?? "");

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>{ui.title}</h1>
        {!failed && <span style={{ color: "var(--muted)", fontSize: 13 }}>{rows.length}</span>}
        <span style={{ flex: 1 }} />
        {ui.canCreate && (
          <Link href={`/admin/content/${collection}/new`} style={{ fontSize: 14 }}>
            Add {ui.title.replace(/s$/, "").toLowerCase()}
          </Link>
        )}
      </div>

      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>{ui.description}</p>

      {ui.canPublish && (
        <nav style={{ display: "flex", gap: 14, margin: "12px 0", fontSize: 13 }}>
          <Link href={`/admin/content/${collection}`}>All</Link>
          <Link href={`/admin/content/${collection}?published=true`}>Published</Link>
          <Link href={`/admin/content/${collection}?published=false`}>Unpublished</Link>
        </nav>
      )}

      {failed ? (
        <p role="alert" style={{ color: "var(--danger)" }}>
          This list could not be loaded. The content itself is unaffected — this is a display
          failure. Check the database connection and reload.
        </p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          {filtering
            ? `Nothing matches this filter. ${published === "false" ? "Everything is published." : "Nothing is published yet."}`
            : ui.emptyState}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid var(--border)" }}>
                {ui.columns.map((c) => (
                  <th key={c.name} style={cell}>
                    {c.label}
                  </th>
                ))}
                {canReorderHere && <th style={cell}>Order</th>}
                <th style={cell} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const group = peers.get(groupOf(row)) ?? [];
                return (
                  <tr key={String(row.id)} style={{ borderBottom: "1px solid var(--border)" }}>
                    {ui.columns.map((c) => (
                      <td key={c.name} style={cell}>
                        {render(c.name, row[c.name], c.pill === true)}
                      </td>
                    ))}
                    {canReorderHere && (
                      <td style={cell}>
                        <ReorderButtons
                          slug={collection}
                          ids={group}
                          index={group.indexOf(String(row.id))}
                        />
                      </td>
                    )}
                    <td style={cell}>
                      <Link href={`/admin/content/${collection}/${String(row.id)}`}>Edit</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ui.canReorder && filtering && (
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
              Reordering is available on the unfiltered list — choose “All” above. Moving a row
              while a filter is applied would change its position relative to the rows this
              filter is hiding.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function render(name: string, value: unknown, pill: boolean): React.ReactNode {
  if (value === null || value === undefined) return <span style={{ color: "var(--muted)" }}>—</span>;

  if (name === "price_from_paise" && typeof value === "number") {
    return `₹${rupeesFromPaise(value)}`;
  }

  if (pill) {
    const truthy = value === true || value === "published";
    return (
      <span
        style={{
          fontSize: 12,
          padding: "2px 8px",
          borderRadius: 99,
          background: truthy ? "#e8f1e6" : "#f1f0ec",
          color: truthy ? "var(--ok)" : "var(--muted)",
        }}
      >
        {typeof value === "boolean" ? (value ? "yes" : "no") : String(value)}
      </span>
    );
  }

  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = String(value);
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

const cell: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top" };
