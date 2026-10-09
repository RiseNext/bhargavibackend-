/**
 * Dashboard.
 *
 * Two of these tiles exist to catch SILENT failures rather than to look busy:
 *
 *  · **Encryption failures** — rows with `message_present = true` and no
 *    ciphertext. That is D-035's write-failure state, invisible from the
 *    website, so without a number here the only signal is a line in the server
 *    log — there is no alert email (D-038).
 *  · **Last rebuild** — risk 6 is "the deploy hook fails silently and editors
 *    watch nothing move". Showing when the last rebuild fired, and whether it
 *    worked, is the detection.
 */

import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guard";
import { query, queryOne } from "@/lib/db";
import { isCloudinaryConfigured } from "@/lib/cloudinary/client";
import { isDeployHookConfigured } from "@/lib/deploy-hook";
import { publishingState } from "@/lib/publishing-state";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireAdminPage("/admin");

  const leads = await queryOne<{
    total: string;
    new_count: string;
    failures: string;
  }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE status = 'new')::text AS new_count,
            count(*) FILTER (WHERE message_present AND message_encrypted IS NULL)::text AS failures
       FROM submissions`,
  );

  const applications = await queryOne<{ total: string; owing: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE resume_method = 'email' AND resume_received_at IS NULL)::text
              AS owing
       FROM applications`,
  );

  const unpublished = await query<{ entity: string; n: string }>(
    `SELECT 'services' AS entity, count(*)::text AS n FROM services
       WHERE NOT published AND deleted_at IS NULL
     UNION ALL SELECT 'testimonials', count(*)::text FROM testimonials
       WHERE NOT published AND deleted_at IS NULL
     UNION ALL SELECT 'videos', count(*)::text FROM videos
       WHERE NOT published AND deleted_at IS NULL
     UNION ALL SELECT 'jobs', count(*)::text FROM jobs
       WHERE NOT published AND deleted_at IS NULL`,
  );

  const hook = await queryOne<{ created_at: Date; diff: { ok?: boolean } | null }>(
    `SELECT created_at, diff FROM audit_log
      WHERE action = 'deploy_hook' ORDER BY created_at DESC LIMIT 1`,
  );

  // The last SUCCESSFUL rebuild and the newest content change — the two values
  // whose comparison answers "is the public site current?".
  const hookOk = await queryOne<{ created_at: Date }>(
    `SELECT created_at FROM audit_log
      WHERE action = 'deploy_hook' AND diff->>'ok' = 'true'
      ORDER BY created_at DESC LIMIT 1`,
  );

  const contentChange = await queryOne<{ latest: Date | null }>(
    `SELECT max(updated_at) AS latest FROM (
        SELECT updated_at FROM services UNION ALL
        SELECT updated_at FROM testimonials UNION ALL
        SELECT updated_at FROM videos UNION ALL
        SELECT updated_at FROM faqs UNION ALL
        SELECT updated_at FROM jobs UNION ALL
        SELECT updated_at FROM content_blocks UNION ALL
        SELECT updated_at FROM site_settings
     ) c`,
  );

  const publishing = publishingState({
    configured: isDeployHookConfigured(),
    lastContentChangeAt: contentChange?.latest ?? null,
    lastSuccessAt: hookOk?.created_at ?? null,
    lastAttemptFailed: hook !== undefined && hook.diff?.ok !== true,
  });

  const unpublishedTotal = unpublished.reduce((sum, r) => sum + Number(r.n), 0);
  const failures = Number(leads?.failures ?? "0");

  return (
    <>
      <h1 style={{ fontSize: 20, marginTop: 0 }}>Dashboard</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
        Signed in as {session.user.name}.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
          gap: 14,
          marginTop: 20,
        }}
      >
        <Tile label="New leads" value={leads?.new_count ?? "0"} href="/admin/leads?status=new" />
        <Tile label="Leads, all time" value={leads?.total ?? "0"} href="/admin/leads" />
        <Tile
          label="Applications"
          value={applications?.total ?? "0"}
          href="/admin/applications"
        />
        <Tile
          label="Awaiting an emailed CV"
          value={applications?.owing ?? "0"}
          href="/admin/applications?resumeMethod=email"
        />
        <Tile label="Unpublished content" value={String(unpublishedTotal)} />
      </div>

      {failures > 0 && (
        // 🔴 Never silent. This is the one number that means patient data was
        // accepted but could not be stored securely.
        <p
          role="alert"
          style={{
            marginTop: 20,
            padding: 12,
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius)",
            color: "var(--danger)",
            fontSize: 14,
          }}
        >
          <strong>{failures}</strong> lead(s) have a message that could not be encrypted. The
          leads themselves are safe and the text reached the clinic over WhatsApp, but the
          database copy is missing. Check the encryption key configuration.
        </p>
      )}

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Publishing</h2>

      {/*
        🔴 The panel that was missing. It previously reported only the last
        rebuild ATTEMPT, and reported the never-configured case as "No rebuild
        has been triggered yet … this will populate once one fires" — wording
        that describes a wait rather than a permanent failure. An administrator
        read that while every content change they made sat unpublished.

        `not_configured` and `failing` are rendered in the danger colour used by
        the encryption-failure alert, because they are the same class of problem:
        the system is not doing the job the operator believes it is doing.
      */}
      <p
        {...(publishing.state === "not_configured" || publishing.state === "failing"
          ? { role: "alert" as const }
          : {})}
        style={{
          fontSize: 14,
          marginTop: 0,
          ...(publishing.state === "not_configured" || publishing.state === "failing"
            ? {
                padding: 12,
                border: "1px solid var(--danger)",
                borderRadius: "var(--radius)",
                color: "var(--danger)",
              }
            : { color: "var(--muted)" }),
        }}
      >
        {publishing.message}
      </p>

      <p style={{ fontSize: 13, color: "var(--muted)" }}>
        {publishing.lastSuccessAt === null
          ? "No rebuild has ever completed successfully."
          : `Last successful rebuild ${publishing.lastSuccessAt
              .slice(0, 16)
              .replace("T", " ")} UTC.`}
        {hook !== undefined && hook.diff?.ok !== true && (
          <>
            {" "}
            Last attempt {hook.created_at.toISOString().slice(0, 16).replace("T", " ")} UTC
            failed.
          </>
        )}
      </p>

      {/*
        Which build is running. "Is the fix deployed?" could not be answered
        from anything the backend served, so a pushed commit and a running
        commit were indistinguishable from here.
      */}
      {process.env.RAILWAY_GIT_COMMIT_SHA !== undefined && (
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          Backend build <code>{process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7)}</code>
          {process.env.RAILWAY_GIT_BRANCH !== undefined && ` on ${process.env.RAILWAY_GIT_BRANCH}`}.
        </p>
      )}

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Integrations</h2>
      <ul style={{ fontSize: 14, paddingLeft: 18 }}>
        {/*
          🔴 D-038 — this deliberately no longer reports a mail integration.
          It used to warn in orange that nobody was being emailed; that is now
          the intended design, and leaving a warning there would train whoever
          runs the clinic to ignore the colour that marks real problems.
        */}
        <li>
          Email notifications: <strong>not used</strong> — by design. This dashboard is
          how new enquiries are seen, and the enquiry text also reaches the clinic
          over WhatsApp when the visitor submits.
        </li>
        <li>
          Media storage: {isCloudinaryConfigured() ? "configured" : "NOT configured"}
          {!isCloudinaryConfigured() && (
            <span style={{ color: "var(--warn)" }}> — image uploads are unavailable.</span>
          )}
        </li>
      </ul>
    </>
  );
}

function Tile({ label, value, href }: { label: string; value: string; href?: string }) {
  const body = (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 14,
        height: "100%",
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>{label}</div>
    </div>
  );

  return href ? (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      {body}
    </Link>
  ) : (
    body
  );
}
