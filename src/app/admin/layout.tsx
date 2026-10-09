/**
 * Admin shell.
 *
 * Deliberately plain. The public website's design lives in the frontend repo and
 * D-010 forbids touching it; sharing tokens across two repositories would create
 * exactly the coupling that makes such a change easy to do by accident. This is
 * an internal tool and looks like one.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { currentSession } from "@/lib/auth/guard";
import SignOutButton from "./_components/SignOutButton";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/branches", label: "Branches" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();

  // The login page renders inside this layout too, and has no session. The
  // AUTHORITATIVE guard is `requireAdmin()` in each page and handler — this is
  // only chrome.
  if (!session) return <>{children}</>;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <strong style={{ color: "var(--accent)" }}>Bhargavi Health World</strong>

        <nav style={{ display: "flex", gap: 16, flex: 1, flexWrap: "wrap" }}>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
              {item.label}
            </Link>
          ))}
        </nav>

        <span style={{ color: "var(--muted)", fontSize: 13 }}>{session.user.name}</span>

        <SignOutButton />
      </header>

      <main style={{ padding: 20, flex: 1, maxWidth: 1200, width: "100%", margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}
