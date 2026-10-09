"use client";

/**
 * Change-your-own-password form.
 *
 * Calls `POST /api/admin/auth/password`, which enforces the session, the
 * double-submit CSRF token, re-verification of the CURRENT password, the
 * strength rules and the audit row — the same reason `SettingsForm` does not use
 * a Server Action.
 *
 * 🔴 WHY THIS SCREEN EXISTS. The endpoint has been there since the admin was
 * built, but nothing in the UI called it: `git grep "auth/password"` across
 * `src/app` matched only the route file itself. So the only way to change a
 * password was a hand-written `fetch` with the CSRF token attached from the
 * browser console — which is not a thing to ask a clinic owner to do, and meant
 * the first administrator was stuck on the generated password the CLI printed.
 * `scripts/admin-create.ts` even told operators to "change the password through
 * the admin UI", which did not exist.
 *
 * 🔴 THE SERVER OWNS THE STRENGTH RULES. `validatePasswordStrength` lives in
 * `src/lib/auth/password.ts`, which imports `@node-rs/argon2` — a native module
 * that cannot be bundled for the browser. Re-implementing the rules here would
 * create a second copy that drifts, so this form checks only the one thing that
 * is genuinely a UI concern (the two new entries matching) and renders the
 * server's own message verbatim for everything else. The length in the hint
 * below is pinned to `MIN_PASSWORD_LENGTH` by
 * `tests/admin-password-change.test.ts`.
 *
 * 🔴 NOTHING HERE LOGS A PASSWORD. No `console` call, no password in a URL or a
 * query string, and all three fields are cleared on success. The values live in
 * component state for the lifetime of the request and nowhere else.
 */

import { useState } from "react";

const CSRF_COOKIE = "bhw_csrf";

function csrfToken(): string {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

/** Mirrors MIN_PASSWORD_LENGTH; pinned by the test rather than imported. */
const MIN_LENGTH_HINT = 12;

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  marginTop: 4,
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontSize: 14,
};

export default function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | undefined>();
  const [revoked, setRevoked] = useState(0);

  /** Any edit clears the previous outcome, so stale success never misleads. */
  const edit = (setter: (value: string) => void) => (value: string): void => {
    setter(value);
    setState("idle");
    setError(undefined);
  };

  async function save(): Promise<void> {
    // The one check that is a UI concern rather than a server rule: a typo in
    // the confirmation must not reach the endpoint as a valid new password.
    if (next !== confirm) {
      setError("The new password and its confirmation do not match.");
      return;
    }

    setState("saving");
    setError(undefined);

    try {
      const response = await fetch("/api/admin/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });

      if (!response.ok) {
        // The endpoint's own wording is the most accurate thing to show: it
        // distinguishes a wrong current password from a weak new one, and
        // paraphrasing would drift from the rules it actually applies.
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Could not change the password (${String(response.status)}).`);
        setState("idle");
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        otherSessionsRevoked?: number;
      };
      setRevoked(body.otherSessionsRevoked ?? 0);

      // Clear immediately: there is no reason for the old or new password to
      // stay in memory, and leaving them in the inputs invites a resubmit.
      setCurrent("");
      setNext("");
      setConfirm("");
      setState("saved");
    } catch {
      setError("Could not reach the server.");
      setState("idle");
    }
  }

  const ready = current !== "" && next !== "" && confirm !== "" && state !== "saving";

  return (
    <div style={{ maxWidth: 420 }}>
      <label style={{ display: "block", margin: "12px 0", fontSize: 14 }}>
        Current password
        <input
          type="password"
          value={current}
          autoComplete="current-password"
          onChange={(e) => edit(setCurrent)(e.target.value)}
          style={inputStyle}
        />
      </label>

      <label style={{ display: "block", margin: "12px 0", fontSize: 14 }}>
        New password
        <input
          type="password"
          value={next}
          autoComplete="new-password"
          onChange={(e) => edit(setNext)(e.target.value)}
          style={inputStyle}
        />
      </label>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 12px" }}>
        At least {String(MIN_LENGTH_HINT)} characters, mixing upper and lower case, with at
        least one digit. Your browser&apos;s password manager can generate and save one.
      </p>

      <label style={{ display: "block", margin: "12px 0", fontSize: 14 }}>
        Confirm new password
        <input
          type="password"
          value={confirm}
          autoComplete="new-password"
          onChange={(e) => edit(setConfirm)(e.target.value)}
          style={inputStyle}
        />
      </label>

      {error !== undefined && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
          {error}
        </p>
      )}
      {state === "saved" && (
        <p style={{ color: "var(--ok)", fontSize: 13 }}>
          Password changed. You are still signed in here
          {revoked > 0
            ? `, and ${String(revoked)} other sign-in${revoked === 1 ? "" : "s"} ${
                revoked === 1 ? "was" : "were"
              } signed out.`
            : "."}
        </p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={!ready}
        style={{
          background: ready ? "var(--accent)" : "var(--border)",
          color: ready ? "var(--accent-text)" : "var(--muted)",
          border: "none",
          borderRadius: "var(--radius)",
          padding: "9px 16px",
          cursor: ready ? "pointer" : "default",
          marginTop: 6,
        }}
      >
        {state === "saving" ? "Changing…" : "Change password"}
      </button>
    </div>
  );
}
