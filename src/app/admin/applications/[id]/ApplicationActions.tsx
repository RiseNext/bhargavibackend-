"use client";

/**
 * The actions on one application: move its status, keep notes, and download the
 * CV.
 *
 * Calls `PATCH /api/admin/applications/{id}` and
 * `GET /api/admin/applications/{id}/resume-signed-url`, which between them own
 * the session check, the CSRF check, the strict allowlist, the IDOR-safe join
 * and the audit rows — the same reason `LeadActions` does not use a Server
 * Action.
 *
 * 🔴 THE CV IS NEVER LINKED DIRECTLY. `media.secure_url` is NULL for a resume by
 * design (D-018: `type=authenticated`, `resource_type=raw`), so there is no
 * durable URL to put in an `href`. The only way to read one is to ask the
 * endpoint for a 120-second signed URL, and that request is what writes the
 * `resume_download` audit row. Rendering a link the browser could prefetch, or
 * minting a Cloudinary URL here, would both defeat that.
 *
 * 🔴 THE TAB IS RESERVED SYNCHRONOUSLY, BEFORE THE AWAIT. This is the same
 * constraint D-030 records for the public forms: a `window.open()` that happens
 * after an `await` has lost the user gesture, and the browser blocks it. So the
 * click opens a blank tab immediately and the fetch result is navigated into it.
 * If the browser blocked it anyway, the signed URL is shown as a link to click
 * instead — the download still works, and the audit row was already written.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApplicationStatus, ResumeState } from "@/lib/leads/applications";

const CSRF_COOKIE = "bhw_csrf";

function csrfToken(): string {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

const STATUSES: ApplicationStatus[] = ["new", "screening", "interviewed", "rejected", "hired"];

/** Only these states have bytes to fetch. */
const DOWNLOADABLE: ReadonlySet<ResumeState> = new Set<ResumeState>([
  "upload_confirmed",
  "received",
]);

const box: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: 16,
};

const button: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--accent-text)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "9px 16px",
  cursor: "pointer",
};

export default function ApplicationActions({
  id,
  status,
  adminNotes,
  resumeState,
  hasResume,
}: {
  id: string;
  status: ApplicationStatus;
  adminNotes: string | null;
  resumeState: ResumeState;
  hasResume: boolean;
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState<ApplicationStatus>(status);
  const [notes, setNotes] = useState(adminNotes ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | undefined>();

  const [cvState, setCvState] = useState<"idle" | "fetching">("idle");
  const [cvError, setCvError] = useState<string | undefined>();
  const [fallbackUrl, setFallbackUrl] = useState<string | undefined>();

  const canDownload = hasResume && DOWNLOADABLE.has(resumeState);

  async function save(): Promise<void> {
    setState("saving");
    setError(undefined);

    try {
      const response = await fetch(`/api/admin/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
        body: JSON.stringify({
          status: nextStatus,
          adminNotes: notes.trim() === "" ? null : notes.trim(),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Could not save (${String(response.status)}).`);
        setState("idle");
        return;
      }

      setState("saved");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setState("idle");
    }
  }

  function downloadCv(): void {
    setCvError(undefined);
    setFallbackUrl(undefined);
    setCvState("fetching");

    // 🔴 Synchronous, inside the click — see the note at the top of this file.
    const tab = window.open("", "_blank");

    void (async () => {
      try {
        const response = await fetch(`/api/admin/applications/${id}/resume-signed-url`, {
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          tab?.close();
          setCvError(body.error ?? `Could not get the CV (${String(response.status)}).`);
          setCvState("idle");
          return;
        }

        const body = (await response.json()) as { url?: string; expiresInSeconds?: number };
        if (typeof body.url !== "string") {
          tab?.close();
          setCvError("The server did not return a download link.");
          setCvState("idle");
          return;
        }

        if (tab) tab.location.href = body.url;
        // Blocked despite reserving the tab: hand the admin the link rather than
        // silently doing nothing. The download was already audited.
        else setFallbackUrl(body.url);

        setCvState("idle");
      } catch {
        tab?.close();
        setCvError("Could not reach the server.");
        setCvState("idle");
      }
    })();
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={box}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>CV</h2>

        {canDownload ? (
          <>
            <button type="button" onClick={downloadCv} disabled={cvState === "fetching"} style={button}>
              {cvState === "fetching" ? "Preparing…" : "Download CV"}
            </button>
            <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 0 }}>
              Opens a private link that expires after two minutes. Every download is
              recorded in the audit log.
            </p>
          </>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>
            No CV is attached to this application yet.
          </p>
        )}

        {cvError !== undefined && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
            {cvError}
          </p>
        )}
        {fallbackUrl !== undefined && (
          <p style={{ fontSize: 13 }}>
            Your browser blocked the new tab —{" "}
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
              open the CV
            </a>
            .
          </p>
        )}
      </section>

      <section style={box}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Progress</h2>

        <label style={{ display: "block", fontSize: 14 }}>
          Status
          <select
            value={nextStatus}
            onChange={(e) => {
              setNextStatus(e.target.value as ApplicationStatus);
              setState("idle");
              setError(undefined);
            }}
            style={{
              display: "block",
              width: "100%",
              marginTop: 4,
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: 14,
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "block", fontSize: 14, marginTop: 14 }}>
          Notes
          <textarea
            value={notes}
            rows={5}
            onChange={(e) => {
              setNotes(e.target.value);
              setState("idle");
              setError(undefined);
            }}
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              marginTop: 4,
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: 14,
            }}
          />
        </label>

        {error !== undefined && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
            {error}
          </p>
        )}
        {state === "saved" && <p style={{ color: "var(--ok)", fontSize: 13 }}>Saved.</p>}

        <button
          type="button"
          onClick={() => void save()}
          disabled={state === "saving"}
          style={{ ...button, marginTop: 12 }}
        >
          {state === "saving" ? "Saving…" : "Save"}
        </button>
      </section>
    </div>
  );
}
