"use client";

/**
 * Status and notes editor for one lead.
 *
 * Deliberately calls the existing `PATCH /api/admin/submissions/{id}` rather
 * than using a Server Action. That endpoint already enforces `requireAdminMutation`
 * (session + CSRF), validates against a strict allowlist, and writes the audit
 * row — and it is covered by the route-tree guard test. A Server Action would be
 * a SECOND authorisation path for the same mutation, which is how one of them
 * ends up weaker than the other.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

const CSRF_COOKIE = "bhw_csrf";

/** The double-submit token. Readable by design — that is the mechanism. */
function csrfToken(): string {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

const STATUSES = ["new", "contacted", "closed"] as const;

export default function LeadActions({
  id,
  status,
  adminNotes,
}: {
  id: string;
  status: string;
  adminNotes: string | null;
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState(status);
  const [notes, setNotes] = useState(adminNotes ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | undefined>();

  const dirty = nextStatus !== status || notes !== (adminNotes ?? "");

  async function save() {
    setState("saving");
    setError(undefined);

    try {
      const response = await fetch(`/api/admin/submissions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken(),
        },
        body: JSON.stringify({ status: nextStatus, adminNotes: notes === "" ? null : notes }),
      });

      if (!response.ok) {
        setState("error");
        setError(
          response.status === 403
            ? "Your session expired. Reload the page and sign in again."
            : "Could not save. Please try again.",
        );
        return;
      }

      setState("saved");
      // Re-render the server component so the audit trail and timestamps shown
      // elsewhere on the page reflect the change.
      router.refresh();
    } catch {
      setState("error");
      setError("Could not reach the server.");
    }
  }

  return (
    <div style={box}>
      <h2 style={{ fontSize: 15, marginTop: 0 }}>Update</h2>

      <label style={{ display: "block", marginBottom: 12 }}>
        <span style={label}>Status</span>
        <select
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value)}
          style={control}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "block", marginBottom: 12 }}>
        <span style={label}>Internal notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          maxLength={5000}
          style={{ ...control, resize: "vertical", fontFamily: "inherit" }}
        />
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Staff-only. Never shown to the patient.
        </span>
      </label>

      <button
        type="button"
        onClick={() => void save()}
        disabled={!dirty || state === "saving"}
        style={{
          ...control,
          background: dirty ? "var(--accent)" : "var(--border)",
          color: dirty ? "var(--accent-text)" : "var(--muted)",
          border: "none",
          cursor: dirty ? "pointer" : "default",
        }}
      >
        {state === "saving" ? "Saving…" : "Save"}
      </button>

      {state === "saved" && !dirty && (
        <p style={{ color: "var(--ok)", fontSize: 13 }}>Saved.</p>
      )}
      {state === "error" && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
          {error}
        </p>
      )}
    </div>
  );
}

const box: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: 16,
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  marginBottom: 4,
  color: "var(--muted)",
};

const control: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "#fff",
};
