/**
 * Audit log — append-only.
 *
 * Its whole value is answering "who read this patient's symptoms, and when?",
 * so the three actions that move personal data out of the system —
 * `view_message`, `resume_download` and `export` — are highlighted and
 * filterable first, not buried among ordinary content edits.
 */

import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guard";
import { listAudit, type AuditAction, type AuditRow } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** The disclosure actions. Shown in red because they are what an audit is for. */
const DISCLOSURE: ReadonlySet<string> = new Set([
  "view_message",
  "resume_download",
  "export",
]);

const ACTIONS: AuditAction[] = [
  "view_message",
  "resume_download",
  "export",
  "login",
  "login_failed",
  "create",
  "update",
  "delete",
  "publish",
  "unpublish",
  "reorder",
  "password_change",
  "deploy_hook",
];

const FRIENDLY: Partial<Record<string, string>> = {
  view_message: "read a patient's message",
  resume_download: "downloaded a CV",
  export: "exported a spreadsheet",
  login: "signed in",
  login_failed: "failed sign-in",
  logout: "signed out",
  password_change: "changed a password",
  deploy_hook: "site rebuild",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  await requireAdminPage("/admin/audit");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const limit = 100;

  const action =
    params.action && ACTIONS.includes(params.action as AuditAction)
      ? (params.action as AuditAction)
      : undefined;

  let rows: AuditRow[] = [];
  let total = 0;
  let failed = false;

  try {
    const result = await listAudit({
      ...(action ? { action } : {}),
      limit,
      offset: (page - 1) * limit,
    });
    rows = result.rows;
    total = result.total;
  } catch {
    failed = true;
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Audit log</h1>
        {!failed && <span style={{ color: "var(--muted)", fontSize: 13 }}>{total} entries</span>}
      </div>

      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
        Every administrative change, plus every time personal data left the system. Entries can
        never be edited or removed.
      </p>

      <nav style={{ display: "flex", gap: 12, margin: "14px 0", fontSize: 13, flexWrap: "wrap" }}>
        <Link href="/admin/audit">All</Link>
        <Link href="/admin/audit?action=view_message">Message views</Link>
        <Link href="/admin/audit?action=resume_download">CV downloads</Link>
        <Link href="/admin/audit?action=export">Exports</Link>
        <Link href="/admin/audit?action=login_failed">Failed sign-ins</Link>
      </nav>

      {failed ? (
        <p role="alert" style={{ color: "var(--danger)" }}>
          The audit log could not be loaded. The entries themselves are unaffected.
        </p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          {action
            ? "No entries of this kind yet."
            : "No entries yet. The log fills as the panel is used."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid var(--border)" }}>
                <th style={cell}>When</th>
                <th style={cell}>Who</th>
                <th style={cell}>What</th>
                <th style={cell}>Item</th>
                <th style={cell}>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const disclosure = DISCLOSURE.has(row.action);
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={cell}>
                      {row.created_at.toISOString().slice(0, 19).replace("T", " ")}
                    </td>
                    <td style={cell}>{row.actor_name ?? "system"}</td>
                    <td
                      style={{
                        ...cell,
                        color: disclosure ? "var(--danger)" : undefined,
                        fontWeight: disclosure ? 600 : 400,
                      }}
                    >
                      {FRIENDLY[row.action] ?? row.action}
                    </td>
                    <td style={cell}>
                      {row.entity_type ?? "—"}
                      {row.entity_id !== null && (
                        <span style={{ color: "var(--muted)" }}>
                          {` ${row.entity_id.slice(0, 12)}`}
                        </span>
                      )}
                    </td>
                    <td style={{ ...cell, whiteSpace: "normal", maxWidth: 360 }}>
                      {/* The diff carries changed field names, never a message
                          body, a password or key material. */}
                      <code style={{ fontSize: 12, color: "var(--muted)" }}>
                        {row.diff === null ? "—" : JSON.stringify(row.diff).slice(0, 200)}
                      </code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <nav style={{ display: "flex", gap: 12, marginTop: 16, fontSize: 14 }}>
          {page > 1 && (
            <Link href={`/admin/audit?page=${String(page - 1)}`}>← Newer</Link>
          )}
          <span style={{ color: "var(--muted)" }}>
            Page {page} of {Math.ceil(total / limit)}
          </span>
          {page * limit < total && (
            <Link href={`/admin/audit?page=${String(page + 1)}`}>Older →</Link>
          )}
        </nav>
      )}
    </>
  );
}

const cell: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top" };
