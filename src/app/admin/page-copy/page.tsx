/**
 * Page copy — the headings and section text on every page.
 *
 * Grouped by page, because that is how an editor thinks about it ("change the
 * careers headline"), not by slot.
 *
 * 🔴 Slots cannot be added or removed here. They correspond to real sections the
 * frontend renders, and the list is derived from the content snapshot (D-037):
 * inventing a slot would produce content nobody can see, and deleting one would
 * blank a live section.
 */

import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guard";
import { query } from "@/lib/db";
import { privacyReadiness } from "@/lib/content/privacy";

export const dynamic = "force-dynamic";

/** Friendly names for the page keys, so the index does not read like a schema. */
const PAGE_LABELS: Record<string, string> = {
  home: "Home",
  global: "Shared sections",
  about: "About",
  services: "Services index",
  serviceDetail: "Service detail pages",
  gallery: "Gallery",
  videos: "Health Talks",
  testimonials: "Testimonials",
  blog: "Blog",
  careers: "Careers",
  contact: "Contact",
  notFound: "Page-not-found",
  privacy: "Privacy policy",
};

export default async function PageCopyIndex() {
  await requireAdminPage("/admin/page-copy");

  let rows: Array<{ page: string; slot: string; title: string | null; label: string | null }> = [];
  let failed = false;

  try {
    rows = await query<{ page: string; slot: string; title: string | null; label: string | null }>(
      "SELECT page, slot, title, label FROM content_blocks ORDER BY page, slot",
    );
  } catch {
    failed = true;
  }

  const privacy = failed ? undefined : await privacyReadiness().catch(() => undefined);

  const byPage = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byPage.get(row.page) ?? [];
    list.push(row);
    byPage.set(row.page, list);
  }

  return (
    <>
      <h1 style={{ fontSize: 20, marginTop: 0 }}>Page copy</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
        The headings and section text on each page. {rows.length} editable sections.
      </p>

      {failed ? (
        <p role="alert" style={{ color: "var(--danger)" }}>
          The page-copy list could not be loaded. The content itself is unaffected.
        </p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          No page copy has been seeded yet. Ask a developer to run the content seed.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Headings may contain <code>*asterisks*</code> around a word or phrase — that is how
            the site shows it in italics. Keep them if they are already there.
          </p>

          {[...byPage.entries()].map(([page, slots]) => (
            <section key={page} style={{ marginTop: 22 }}>
              <h2 style={{ fontSize: 15, marginBottom: 8 }}>
                {PAGE_LABELS[page] ?? page}{" "}
                <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 13 }}>
                  {slots.length} section{slots.length === 1 ? "" : "s"}
                </span>
              </h2>

              <div style={{ display: "grid", gap: 6 }}>
                {slots.map((slot) => (
                  <Link
                    key={`${slot.page}.${slot.slot}`}
                    href={`/admin/page-copy/${slot.page}/${slot.slot}`}
                    style={{
                      display: "block",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      padding: "8px 12px",
                      textDecoration: "none",
                      color: "inherit",
                      fontSize: 14,
                    }}
                  >
                    <strong>{slot.slot}</strong>
                    {(slot.title ?? slot.label) !== null && (
                      <span style={{ color: "var(--muted)" }}>
                        {" — "}
                        {(slot.title ?? slot.label ?? "").slice(0, 80)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {/* ── The privacy policy's own gate ─────────────────────────────── */}
      {privacy !== undefined && (
        <section style={{ marginTop: 30 }}>
          <h2 style={{ fontSize: 15 }}>Privacy policy</h2>

          {!privacy.exists ? (
            <p
              style={{
                background: "#fff8e6",
                border: "1px solid var(--warn)",
                borderRadius: "var(--radius)",
                padding: 12,
                fontSize: 13,
              }}
            >
              The privacy policy has not been added yet. A draft exists, but ten details can only
              come from the clinic — including the publication date, the registered business name
              and address, and how long records are kept.
            </p>
          ) : !privacy.publishable ? (
            <p
              role="alert"
              style={{
                background: "#fdeceb",
                border: "1px solid var(--danger)",
                borderRadius: "var(--radius)",
                padding: 12,
                fontSize: 13,
              }}
            >
              <strong>The privacy policy cannot be published yet.</strong>{" "}
              {privacy.slotsWithMarkers.length} section
              {privacy.slotsWithMarkers.length === 1 ? "" : "s"} still need information only the
              clinic can supply.
            </p>
          ) : (
            <p style={{ color: "var(--ok)", fontSize: 13 }}>
              Every detail has been filled in. The policy is ready for final approval.
            </p>
          )}

          <details style={{ fontSize: 13, marginTop: 8 }}>
            <summary style={{ cursor: "pointer" }}>What the clinic must supply</summary>
            <ul style={{ paddingLeft: 18, color: "var(--muted)" }}>
              {privacy.requiredClientInputs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </>
  );
}
