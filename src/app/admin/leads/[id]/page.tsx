/**
 * One lead, in full — including the decrypted message.
 *
 * 🔐 D-035. Opening this page is a DISCLOSURE EVENT: it decrypts a patient's
 * health complaint and writes an `audit_log` row with `action = 'view_message'`.
 * The audit row is written only when a decryption actually occurred, so the
 * trail can answer "who has read this person's symptoms?" accurately.
 *
 * 🔴 When a message exists but cannot be decrypted, this page says so EXPLICITLY.
 * A blank field would imply the patient wrote nothing, which is worse than
 * admitting the key is unavailable — fail visible, not silent.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireAdminPage } from "@/lib/auth/guard";
import { findSubmissionById } from "@/lib/leads/submissions";
import LeadActions from "./LeadActions";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminPage();
  const { id } = await params;

  const found = await findSubmissionById(id);
  if (!found) notFound();

  const { row, decrypted } = found;

  if (decrypted) {
    // Written before rendering, so a render failure cannot produce an
    // unaudited read.
    await audit({
      actorId: session.user.id,
      action: "view_message",
      entityType: "submissions",
      entityId: id,
      diff: { reference: row.reference },
    });
  }

  const facts: Array<[string, string]> = [
    ["Reference", row.reference],
    ["Received", row.createdAt.toISOString().replace("T", " ").slice(0, 19) + " UTC"],
    ["Kind", row.kind],
    ["Name", row.name],
    ["Phone (as submitted)", row.phoneRaw],
    ["Phone (normalised)", row.phoneE164],
    ["Email", row.email ?? "—"],
    ["Branch", row.branchLabel ?? "—"],
    ["Service", row.serviceSlug ?? "—"],
    [
      "Preferred time",
      row.preferredAtRaw
        ? `${row.preferredAtRaw}${row.outsideHours ? "  (outside opening hours)" : ""}`
        : "—",
    ],
    ["Consent given", row.consent ? "yes" : "no"],
    ["WhatsApp handover", row.whatsappHandover === true ? "yes" : "not recorded"],
    ["Source page", row.sourcePage ?? "—"],
    ["IP", row.ip ?? "—"],
  ];

  return (
    <>
      <p style={{ fontSize: 13 }}>
        <Link href="/admin/leads">← All leads</Link>
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
            <h2 style={{ fontSize: 15, marginTop: 0 }}>Enquiry</h2>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", margin: 0 }}>
              {facts.map(([key, value]) => (
                <div key={key} style={{ display: "contents" }}>
                  <dt style={{ color: "var(--muted)", fontSize: 13 }}>{key}</dt>
                  <dd style={{ margin: 0, fontSize: 14 }}>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section style={box}>
            <h2 style={{ fontSize: 15, marginTop: 0 }}>
              Message
              {row.messagePresent && (
                <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>
                  {"  "}· health information · this view is audited
                </span>
              )}
            </h2>

            {row.messageError !== null ? (
              // 🔴 Fail visible. Never a blank field implying nothing was written.
              <p role="alert" style={{ color: "var(--danger)", fontSize: 14 }}>
                {row.messageError}
              </p>
            ) : row.message !== null ? (
              <p style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 14 }}>{row.message}</p>
            ) : (
              <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>
                No message was submitted with this enquiry.
              </p>
            )}

            {row.consentText !== null && (
              <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 0 }}>
                Consented to: “{row.consentText}”
              </p>
            )}
          </section>
        </div>

        <LeadActions id={row.id} status={row.status} adminNotes={row.adminNotes} />
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
