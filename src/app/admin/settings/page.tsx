/**
 * Site settings — the clinic's business facts.
 *
 * 🔴 Two things are deliberately NOT on this screen, and the page says so
 * rather than leaving an editor hunting:
 *
 *  · **Phone numbers.** They are derived from the branches, ordered by the
 *    phone ordering (D-013). A field here would be a second place to change a
 *    number, and the two would drift.
 *  · **Address, coordinates, map and hours.** These resolve from the first
 *    branch, in branch order, that actually has each one (D-029). Putting them
 *    here would duplicate a branch's data.
 */

import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guard";
import { queryOne } from "@/lib/db";
import { loadBranches } from "@/lib/settings/site-settings";
import { resolveGlobals } from "@/lib/settings/resolve";
import SettingsForm from "./SettingsForm";
import PasswordForm from "./PasswordForm";

export const dynamic = "force-dynamic";

const COLUMNS = `
  business_name, short_name, tagline, description, locale,
  founder_name, founder_honorific, founder_qualifications, founder_role,
  public_email, default_whatsapp_e164, default_notify_email, careers_notify_email,
  price_range, brand_color, theme_color,
  default_seo_title_template, default_seo_description, robots_allow,
  analytics_measurement_id, updated_at`;

export default async function SettingsPage() {
  await requireAdminPage("/admin/settings");

  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${COLUMNS} FROM site_settings WHERE id = 1`,
  );

  if (!row) {
    return (
      <p role="alert" style={{ color: "var(--danger)" }}>
        No settings row exists. The seed has not run — ask a developer to run{" "}
        <code>npm run seed</code>.
      </p>
    );
  }

  const branches = await loadBranches();
  const provenance = resolveGlobals(branches).provenance;
  const nameFor = (slug: string | null): string =>
    branches.find((b) => b.slug === slug)?.name ?? "no branch";

  return (
    <>
      <h1 style={{ fontSize: 20, marginTop: 0 }}>Site settings</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
        The clinic&apos;s name, founder, contact details, brand and search-engine defaults.
      </p>

      <SettingsForm row={row} />

      <section
        style={{
          marginTop: 30,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 14,
        }}
      >
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Not edited here</h2>

        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          These come from the branches, so there is only ever one place to change them.
        </p>

        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px", margin: 0, fontSize: 14 }}>
          <dt style={{ color: "var(--muted)" }}>Phone numbers</dt>
          <dd style={{ margin: 0 }}>
            From the branches, in the phone order — <Link href="/admin/branches">edit branches</Link>
          </dd>

          <dt style={{ color: "var(--muted)" }}>Address</dt>
          <dd style={{ margin: 0 }}>{nameFor(provenance.address)}</dd>

          <dt style={{ color: "var(--muted)" }}>Coordinates</dt>
          <dd style={{ margin: 0 }}>{nameFor(provenance.geo)}</dd>

          <dt style={{ color: "var(--muted)" }}>Opening hours</dt>
          <dd style={{ margin: 0 }}>{nameFor(provenance.hours)}</dd>

          <dt style={{ color: "var(--muted)" }}>Map</dt>
          <dd style={{ margin: 0 }}>{nameFor(provenance.mapEmbedSrc)}</dd>
        </dl>
      </section>

      {/*
        Your own sign-in, not the clinic's business facts — which is why it sits
        in its own section rather than inside `SettingsForm`. It posts to
        `POST /api/admin/auth/password`; nothing about it is a `site_settings`
        column, so it shares no state with the form above.
      */}
      <section
        style={{
          marginTop: 30,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 14,
        }}
      >
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Your password</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
          Changing it signs out every other device and keeps you signed in here.
        </p>

        <PasswordForm />
      </section>
    </>
  );
}
