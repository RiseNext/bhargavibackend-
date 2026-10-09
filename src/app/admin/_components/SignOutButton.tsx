"use client";

/**
 * Sign out.
 *
 * 🔴 WHY THIS IS A CLIENT COMPONENT AND NOT A PLAIN FORM. The layout used to
 * render `<form action="/api/admin/auth/logout" method="post">`. The logout
 * route was later hardened to require the double-submit CSRF token on a LIVE
 * session — correctly, because a cross-site POST could otherwise force-log-out
 * the administrator. But a plain HTML form cannot send a custom header, so the
 * one caller of that endpoint started failing closed:
 *
 *   POST /api/admin/auth/logout → 403 {"error":"CSRF token missing or invalid."}
 *   live sessions 2 → 2, and the browser navigated to that raw JSON instead of
 *   the login screen.
 *
 * The admin panel had no working sign-out, and every API-level test still passed
 * because they send the header the form could not.
 *
 * So the token goes in the header, exactly as `RecordForm` does it. The route's
 * contract is unchanged — CSRF is still required — and the button now satisfies
 * it instead of tripping over it.
 */

import { useState } from "react";

const CSRF_COOKIE = "bhw_csrf";

/** The double-submit token. Readable by design — that is the mechanism. */
function csrfToken(): string {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut(): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/admin/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken() },
      });

      if (!response.ok) {
        // 🔴 Never pretend. A failed sign-out that looked successful would leave
        // a live session on what the user believes is a signed-out machine.
        setFailed(true);
        setBusy(false);
        return;
      }

      // A full load, not `router.push`: the session is gone, so every cached
      // server-component payload for this user is now stale.
      window.location.href = "/admin/login";
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {failed && (
        <span role="alert" style={{ color: "var(--danger)", fontSize: 12 }}>
          Sign out failed — you are still signed in.
        </span>
      )}
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "4px 10px",
          cursor: "pointer",
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </span>
  );
}
