"use client";

/**
 * Admin sign-in.
 *
 * Surfaces ONE generic message for every failure — unknown account, wrong
 * password, locked, deactivated — because distinguishing them is an account
 * enumeration oracle. The endpoint already enforces that; this screen must not
 * undo it by rendering a more "helpful" error.
 */

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        // `next` is read from the query string the middleware set, so a user who
        // deep-linked lands where they meant to.
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = next?.startsWith("/admin") ? next : "/admin";
        return;
      }

      if (response.status === 429) {
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else {
        setError("Invalid email or password.");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 20 }}>
      <form
        onSubmit={submit}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 28,
          width: "100%",
          maxWidth: 380,
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Sign in</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
          Bhargavi Health World — admin
        </p>

        <label style={{ display: "block", marginTop: 18 }}>
          <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            style={field}
          />
        </label>

        <label style={{ display: "block", marginTop: 14 }}>
          <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={field}
          />
        </label>

        {error !== undefined && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} style={{ ...button, marginTop: 18, width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

const field: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "#fff",
};

const button: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--accent-text)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "10px 14px",
  cursor: "pointer",
};
