/**
 * The lead inbox — E5. The screen the clinic actually opens.
 *
 * 🔐 D-035: this list shows **"has a message"**, never the message. It reads
 * `SubmissionListRow`, whose type has no `message` field, so there is nothing to
 * leak here even by accident. Reading a complaint means opening the detail view,
 * which decrypts and writes a `view_message` audit row.
 *
 * Every state is distinguishable: no leads at all, a filter that matched
 * nothing, and a failed query are three different messages — because "nothing
 * here" when the database is down is how a clinic concludes the forms are
 * broken.
 */

import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guard";
import {
  listSubmissions,
  type SubmissionKind,
  type SubmissionListRow,
  type SubmissionStatus,
} from "@/lib/leads/submissions";

export const dynamic = "force-dynamic";

const KINDS: SubmissionKind[] = ["appointment", "contact"];
const STATUSES: SubmissionStatus[] = ["new", "contacted", "closed"];

const STATUS_COLOUR: Record<SubmissionStatus, string> = {
  new: "var(--accent)",
  contacted: "var(--warn)",
  closed: "var(--muted)",
};

interface SearchParams {
  kind?: string;
  status?: string;
  q?: string;
  page?: string;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminPage("/admin/leads");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const limit = 50;

  const filters = {
    ...(params.kind && KINDS.includes(params.kind as SubmissionKind)
      ? { kind: params.kind as SubmissionKind }
      : {}),
    ...(params.status && STATUSES.includes(params.status as SubmissionStatus)
      ? { status: params.status as SubmissionStatus }
      : {}),
    ...(params.q ? { q: params.q } : {}),
  };

  const hasFilter = Object.keys(filters).length > 0;

  let rows: SubmissionListRow[] = [];
  let total = 0;
  let failed = false;

  try {
    const result = await listSubmissions({ ...filters, limit, offset: (page - 1) * limit });
    rows = result.rows;
    total = result.total;
  } catch {
    // A failed query must not render as "no leads" — see the comment above.
    failed = true;
  }

  const csvHref = `/api/admin/submissions?format=csv${
    params.kind ? `&kind=${params.kind}` : ""
  }${params.status ? `&status=${params.status}` : ""}`;

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Leads</h1>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>
          {failed ? "" : `${String(total)} total`}
        </span>
        <span style={{ flex: 1 }} />
        {/* The default export has no message column (D-035). */}
        <a href={csvHref} style={{ fontSize: 13 }}>
          Export CSV
        </a>
      </div>

      <form method="get" style={{ display: "flex", gap: 10, margin: "16px 0", flexWrap: "wrap" }}>
        <select name="kind" defaultValue={params.kind ?? ""} style={control}>
          <option value="">All kinds</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        <select name="status" defaultValue={params.status ?? ""} style={control}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* 🔐 Searches name, phone and reference. Never the message. */}
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Name, phone or reference"
          style={{ ...control, minWidth: 220 }}
        />

        <button type="submit" style={control}>
          Filter
        </button>
      </form>

      {failed ? (
        <p role="alert" style={{ color: "var(--danger)" }}>
          The lead list could not be loaded. The leads themselves are unaffected — this is a
          display failure. Check the database connection and try again.
        </p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          {hasFilter
            ? "No leads match these filters. Clear them to see everything."
            : "No leads yet. They appear here the moment someone submits a form."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid var(--border)" }}>
                <th style={cell}>Received</th>
                <th style={cell}>Reference</th>
                <th style={cell}>Kind</th>
                <th style={cell}>Name</th>
                <th style={cell}>Phone</th>
                <th style={cell}>Branch</th>
                <th style={cell}>Service</th>
                <th style={cell}>Message</th>
                <th style={cell}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={cell}>{row.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td style={cell}>
                    <Link href={`/admin/leads/${row.id}`}>{row.reference}</Link>
                  </td>
                  <td style={cell}>{row.kind}</td>
                  <td style={cell}>{row.name}</td>
                  <td style={cell}>{row.phoneRaw}</td>
                  <td style={cell}>{row.branchLabel ?? "—"}</td>
                  <td style={cell}>{row.serviceSlug ?? "—"}</td>
                  <td style={cell}>
                    {/* 🔐 From `message_present`. Nothing is decrypted here. */}
                    {row.messagePresent ? "has a message" : "—"}
                  </td>
                  <td style={{ ...cell, color: STATUS_COLOUR[row.status] }}>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <nav style={{ display: "flex", gap: 12, marginTop: 16, fontSize: 14 }}>
          {page > 1 && <Link href={`/admin/leads?page=${String(page - 1)}`}>← Previous</Link>}
          <span style={{ color: "var(--muted)" }}>
            Page {page} of {Math.ceil(total / limit)}
          </span>
          {page * limit < total && (
            <Link href={`/admin/leads?page=${String(page + 1)}`}>Next →</Link>
          )}
        </nav>
      )}
    </>
  );
}

const cell: React.CSSProperties = { padding: "8px 10px", whiteSpace: "nowrap" };

const control: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "#fff",
};
