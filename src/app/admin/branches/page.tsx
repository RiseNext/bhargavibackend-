/**
 * Branches screen — ranked risk 1 of the whole project.
 *
 * 🔴 The job of this page is to make the D-013 trap impossible to fall into by
 * accident. `sortOrder` and `phoneSortOrder` are INDEPENDENT: in the live site
 * `branches[0]` is Chikkadpally while `phones[0]` is Bowenpally — exact
 * reverses. Eight occurrences across five UI surfaces read `phones[0]`.
 *
 * So the two orderings are shown as two separate, labelled lists with the
 * consequence of each spelled out, rather than as one "order" column an editor
 * would reasonably assume governs everything.
 *
 * 🔴 It also shows which branch currently supplies each site-wide field (D-029),
 * because the most likely confusion is "I entered Bowenpally's address and the
 * footer did not change".
 */

import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guard";
import { query } from "@/lib/db";
import { loadBranches } from "@/lib/settings/site-settings";
import { missingRequiredGlobals, resolveGlobals } from "@/lib/settings/resolve";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  await requireAdminPage("/admin/branches");

  let branches: Awaited<ReturnType<typeof loadBranches>> = [];
  let failed = false;

  try {
    branches = await loadBranches();
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <p role="alert" style={{ color: "var(--danger)" }}>
        The branch list could not be loaded. The branches themselves are unaffected.
      </p>
    );
  }

  const resolved = resolveGlobals(branches);
  const missing = missingRequiredGlobals(resolved);

  const byDisplay = [...branches].sort((a, b) => a.sortOrder - b.sortOrder);
  const byPhone = [...branches].sort((a, b) => a.phoneSortOrder - b.phoneSortOrder);

  // Which fields a branch supplies site-wide — so each row can say so.
  const supplies = (slug: string): string[] =>
    Object.entries(resolved.provenance)
      .filter(([, owner]) => owner === slug)
      .map(([field]) => field);

  return (
    <>
      <h1 style={{ fontSize: 20, marginTop: 0 }}>Branches</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
        Clinic locations, their phone numbers and opening hours.
      </p>

      {missing.length > 0 && (
        // 🔴 The generator fails the build on these, so saying it here is the
        // difference between a clear warning and a mystifying failed deploy.
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
          <strong>No branch supplies {missing.join(", ")}.</strong> The site cannot be rebuilt
          until at least one active branch has {missing.length === 1 ? "it" : "them"} — the
          footer, both contact cards and the search-engine data all read these.
        </p>
      )}

      {/* ── The two orderings, side by side and clearly distinct ───────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
          marginTop: 18,
        }}
      >
        <section style={box}>
          <h2 style={{ fontSize: 15, marginTop: 0 }}>Branch order</h2>
          <p style={note}>
            Controls the order branches are listed in — the appointment form&apos;s branch
            chooser and the footer list.
          </p>
          <ol style={{ paddingLeft: 20, fontSize: 14, margin: 0 }}>
            {byDisplay.map((b) => (
              <li key={b.id}>{b.name}</li>
            ))}
          </ol>
        </section>

        <section style={{ ...box, borderColor: "var(--warn)" }}>
          <h2 style={{ fontSize: 15, marginTop: 0 }}>Phone number order</h2>
          <p style={note}>
            <strong>Separate from the branch order.</strong> Controls which number the site shows
            first — the floating call button, the contact hero, and the closing call-to-action all
            use the first one.
          </p>
          <ol style={{ paddingLeft: 20, fontSize: 14, margin: 0 }}>
            {byPhone.map((b) => (
              <li key={b.id}>
                {b.phoneLabel ?? "—"}{" "}
                <span style={{ color: "var(--muted)" }}>({b.name})</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <p style={{ ...note, marginTop: 14 }}>
        These two lists are deliberately independent, and they are currently in opposite orders.
        Changing one does not change the other.
      </p>

      {/* ── The branches themselves ────────────────────────────────────── */}
      <h2 style={{ fontSize: 16, marginTop: 28 }}>Locations</h2>

      <div style={{ display: "grid", gap: 14 }}>
        {byDisplay.map((branch) => {
          const owns = supplies(branch.slug);

          return (
            <div key={branch.id} style={box}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 15 }}>{branch.name}</strong>
                {branch.isPrimary && <Pill tone="accent">primary</Pill>}
                {!branch.isActive && <Pill tone="muted">hidden</Pill>}
                <span style={{ flex: 1 }} />
                <Link href={`/admin/branches/${branch.id}`} style={{ fontSize: 14 }}>
                  Edit
                </Link>
              </div>

              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px", margin: "10px 0 0" }}>
                <Row label="Phone" value={branch.phoneLabel} />
                <Row label="WhatsApp" value={branch.whatsappE164} />
                <Row label="Address" value={branch.addressFull} />
                <Row
                  label="Coordinates"
                  value={branch.lat !== null && branch.lng !== null ? `${String(branch.lat)}, ${String(branch.lng)}` : null}
                />
                <Row
                  label="Hours"
                  value={branch.hours === null ? null : `${String(branch.hours.length)} day(s) configured`}
                />
              </dl>

              {owns.length > 0 && (
                <p style={{ ...note, marginBottom: 0 }}>
                  Supplies the site-wide <strong>{owns.join(", ")}</strong>.
                </p>
              )}

              {owns.length === 0 && branch.isActive && (
                <p style={{ ...note, marginBottom: 0 }}>
                  Supplies no site-wide fields. The site uses the first branch in the branch order
                  that has each one, so filling in this branch&apos;s details will not change the
                  footer unless its order changes.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ ...note, marginTop: 18 }}>
        Branches are never deleted — that would detach historical patient enquiries from their
        location. Hide one by turning off <strong>Active</strong> instead.
      </p>

      <BranchCount />
    </>
  );
}

async function BranchCount() {
  const rows = await query<{ n: string }>("SELECT count(*)::text AS n FROM branches");
  return (
    <p style={{ ...note, marginTop: 4 }}>
      {rows[0]?.n ?? "0"} branch record(s) in total, including any hidden ones.
    </p>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "contents" }}>
      <dt style={{ color: "var(--muted)", fontSize: 13 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 14 }}>
        {value ?? <span style={{ color: "var(--warn)" }}>not set</span>}
      </dd>
    </div>
  );
}

function Pill({ tone, children }: { tone: "accent" | "muted"; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: "2px 8px",
        borderRadius: 99,
        background: tone === "accent" ? "#e8f1e6" : "#f1f0ec",
        color: tone === "accent" ? "var(--ok)" : "var(--muted)",
      }}
    >
      {children}
    </span>
  );
}

const box: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: 14,
};

const note: React.CSSProperties = { fontSize: 13, color: "var(--muted)" };
