/**
 * Applications inbox.
 *
 * The column that matters operationally is the resume state. D-031 added two
 * columns specifically so "upload incomplete" can distinguish a REJECTED upload
 * from an ABANDONED one — one needs an explanation to the applicant, the other
 * needs a chase. Showing them as one status would lose that.
 *
 * `applications.message` ("Why you?") is plaintext and shown: it is employment
 * data, not health data.
 */

import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guard";
import {
  listApplications,
  type ApplicationRow,
  type ApplicationStatus,
  type ResumeMethod,
  type ResumeState,
} from "@/lib/leads/applications";

export const dynamic = "force-dynamic";

const STATUSES: ApplicationStatus[] = ["new", "screening", "interviewed", "rejected", "hired"];

/** Plain English, and the action each state implies. */
const RESUME_LABEL: Record<ResumeState, { text: string; tone: "ok" | "warn" | "muted" | "danger" }> = {
  not_applicable: { text: "—", tone: "muted" },
  awaiting_email: { text: "waiting for emailed CV", tone: "warn" },
  received: { text: "CV received", tone: "ok" },
  upload_pending: { text: "upload not started", tone: "warn" },
  upload_incomplete: { text: "upload abandoned — ask them to email it", tone: "warn" },
  upload_confirmed: { text: "CV uploaded", tone: "ok" },
  upload_rejected: { text: "upload rejected — explain and ask again", tone: "danger" },
};

const TONE: Record<"ok" | "warn" | "muted" | "danger", string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  muted: "var(--muted)",
  danger: "var(--danger)",
};

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; resumeMethod?: string; q?: string }>;
}) {
  await requireAdminPage("/admin/applications");

  const params = await searchParams;
  const limit = 100;

  const filters = {
    ...(params.status && STATUSES.includes(params.status as ApplicationStatus)
      ? { status: params.status as ApplicationStatus }
      : {}),
    ...(params.resumeMethod === "email" || params.resumeMethod === "upload"
      ? { resumeMethod: params.resumeMethod as ResumeMethod }
      : {}),
    ...(params.q ? { q: params.q } : {}),
  };

  const filtering = Object.keys(filters).length > 0;

  let rows: ApplicationRow[] = [];
  let total = 0;
  let failed = false;

  try {
    const result = await listApplications({ ...filters, limit, offset: 0 });
    rows = result.rows;
    total = result.total;
  } catch {
    failed = true;
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Applications</h1>
        {!failed && <span style={{ color: "var(--muted)", fontSize: 13 }}>{total} total</span>}
      </div>

      <form method="get" style={{ display: "flex", gap: 10, margin: "16px 0", flexWrap: "wrap" }}>
        <select name="status" defaultValue={params.status ?? ""} style={control}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select name="resumeMethod" defaultValue={params.resumeMethod ?? ""} style={control}>
          <option value="">Any CV method</option>
          <option value="upload">Uploaded through the site</option>
          <option value="email">Emailing it separately</option>
        </select>

        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Name, reference or role"
          style={{ ...control, minWidth: 220 }}
        />

        <button type="submit" style={control}>
          Filter
        </button>
      </form>

      {failed ? (
        <p role="alert" style={{ color: "var(--danger)" }}>
          The application list could not be loaded. The applications themselves are unaffected.
        </p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          {filtering
            ? "No applications match these filters."
            : "No applications yet. They appear here as soon as someone applies."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid var(--border)" }}>
                <th style={cell}>Received</th>
                <th style={cell}>Reference</th>
                <th style={cell}>Name</th>
                <th style={cell}>Role</th>
                <th style={cell}>Phone</th>
                <th style={cell}>CV</th>
                <th style={cell}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const resume = RESUME_LABEL[row.resumeState];
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={cell}>
                      {row.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td style={cell}>
                      <Link href={`/admin/applications/${row.id}`}>{row.reference}</Link>
                    </td>
                    <td style={cell}>{row.name}</td>
                    <td style={cell}>{row.roleLabel}</td>
                    <td style={cell}>{row.phoneRaw}</td>
                    <td style={{ ...cell, color: TONE[resume.tone] }}>{resume.text}</td>
                    <td style={cell}>{row.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 18 }}>
        A CV is never attached to an email. Download it from the application itself — each
        download is recorded.
      </p>
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
