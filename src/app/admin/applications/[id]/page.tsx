/**
 * One job application, in full.
 *
 * 🔴 WHY THIS FILE EXISTS. The list at `admin/applications/page.tsx:148` has
 * always linked each reference to `/admin/applications/{id}`, and the whole API
 * behind it shipped — `GET`/`PATCH /api/admin/applications/{id}`,
 * `GET .../resume-signed-url`, `DELETE .../resume` — but this page was never
 * written. Clicking a reference therefore returned a Next.js 404, which is how
 * `BHW-2026-0001` presented: an application visibly "new" with a "CV uploaded"
 * badge that could not be opened or read.
 *
 * `tests/admin-nav.test.ts` could not catch it: it scans only STATIC
 * double-quoted admin links, and its pattern excludes `$` and `{`, so an href
 * written as a template literal in braces is invisible to it.
 * `tests/admin-applications-detail.test.ts` closes that gap for every dynamic
 * admin link, not just this one.
 *
 * ⚠ That scanner reads comments as well as code, so do not write a realistic
 * `href=` attribute in prose here — it will be treated as a real link and fail
 * the nav suite. (Learned the hard way while writing this file.)
 *
 * 🔴 Keyed on the internal UUID, never the reference. References are quoted over
 * the phone and guessable (X-33); the URL carries the UUID and the page is
 * behind `requireAdminPage()`, with `middleware.ts` as the first gate.
 *
 * 🔴 The CV is NOT fetched here. `media.secure_url` is NULL for a resume by
 * design, and the only read path is the signed-URL endpoint, which audits
 * `resume_download` before minting a 120-second link. Rendering the applicant's
 * CV inline would be an unaudited disclosure.
 *
 * ⚠ Opening this page is NOT itself a disclosure event, unlike a lead's
 * decrypted message (D-035): `applications.message` is plaintext employment
 * data, not health data. Nothing here is audited on read; the CV download is.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guard";
import { findApplicationById, type ResumeState } from "@/lib/leads/applications";
import ApplicationActions from "./ApplicationActions";

export const dynamic = "force-dynamic";

/** The same wording the list uses, so one application reads the same in both. */
const RESUME_LABEL: Record<ResumeState, string> = {
  not_applicable: "—",
  awaiting_email: "waiting for emailed CV",
  received: "CV received",
  upload_pending: "upload not started",
  upload_incomplete: "upload abandoned — ask them to email it",
  upload_confirmed: "CV uploaded",
  upload_rejected: "upload rejected — explain and ask again",
};

const utc = (value: Date | null): string =>
  value === null ? "—" : `${value.toISOString().replace("T", " ").slice(0, 19)} UTC`;

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;

  const row = await findApplicationById(id);
  if (!row) notFound();

  const facts: Array<[string, string]> = [
    ["Reference", row.reference],
    ["Received", utc(row.createdAt)],
    ["Role applied for", row.roleLabel],
    ["Name", row.name],
    ["Phone (as submitted)", row.phoneRaw],
    ["Email", row.email ?? "—"],
    ["Experience", row.experience ?? "—"],
    ["CV method", row.resumeMethod],
    ["CV state", RESUME_LABEL[row.resumeState]],
    ["Upload authorised", utc(row.resumeUploadAuthorisedAt)],
    ["Upload confirmed", utc(row.resumeConfirmedAt)],
    ["Marked received", utc(row.resumeReceivedAt)],
    ["Last updated", utc(row.updatedAt)],
  ];

  if (row.resumeUploadRejectedAt !== null) {
    facts.push(["Upload rejected", utc(row.resumeUploadRejectedAt)]);
    facts.push(["Rejection reason", row.resumeRejectionReason ?? "—"]);
  }

  return (
    <>
      <p style={{ fontSize: 13 }}>
        <Link href="/admin/applications">← All applications</Link>
      </p>

      <h1 style={{ fontSize: 20, marginTop: 0 }}>
        {row.name}{" "}
        <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 15 }}>
          {row.reference}
        </span>
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 20 }}>
          <section style={box}>
            <h2 style={{ fontSize: 15, marginTop: 0 }}>Application</h2>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "6px 16px",
                margin: 0,
              }}
            >
              {facts.map(([key, value]) => (
                <div key={key} style={{ display: "contents" }}>
                  <dt style={{ color: "var(--muted)", fontSize: 13 }}>{key}</dt>
                  <dd style={{ margin: 0, fontSize: 14 }}>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section style={box}>
            <h2 style={{ fontSize: 15, marginTop: 0 }}>About themselves</h2>
            {row.message.trim() === "" ? (
              <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>
                They did not write anything here.
              </p>
            ) : (
              <p style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 14 }}>{row.message}</p>
            )}
          </section>
        </div>

        <ApplicationActions
          id={row.id}
          status={row.status}
          adminNotes={row.adminNotes}
          resumeState={row.resumeState}
          hasResume={row.resumeMediaId !== null}
        />
      </div>
    </>
  );
}

const box: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: 16,
};
