"use client";

/**
 * The site-settings form.
 *
 * Calls `PUT /api/admin/site-settings`, which enforces the session, CSRF, the
 * strict allowlist and the audit row — the same reason the record form does not
 * use a Server Action.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import SaveNotice, { publishingConfiguredFrom } from "../_components/SaveNotice";

const CSRF_COOKIE = "bhw_csrf";

function csrfToken(): string {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

interface FieldSpec {
  name: string;
  column: string;
  label: string;
  kind?: "text" | "textarea" | "email" | "boolean" | "color";
  help?: string;
}

const GROUPS: Array<{ title: string; fields: FieldSpec[] }> = [
  {
    title: "Identity",
    fields: [
      { name: "businessName", column: "business_name", label: "Business name" },
      { name: "shortName", column: "short_name", label: "Short name" },
      { name: "tagline", column: "tagline", label: "Tagline" },
      { name: "description", column: "description", label: "Description", kind: "textarea" },
    ],
  },
  {
    title: "Founder",
    fields: [
      { name: "founderName", column: "founder_name", label: "Name" },
      {
        name: "founderHonorific",
        column: "founder_honorific",
        label: "Honorific",
        help: 'Currently "Mrs." everywhere on the site.',
      },
      { name: "founderRole", column: "founder_role", label: "Role" },
      {
        name: "founderQualifications",
        column: "founder_qualifications",
        label: "Qualifications",
      },
    ],
  },
  {
    title: "Contact",
    fields: [
      { name: "publicEmail", column: "public_email", label: "Public email", kind: "email" },
      {
        name: "defaultWhatsappE164",
        column: "default_whatsapp_e164",
        label: "Default WhatsApp",
        help: "In full international form, e.g. +917075157013.",
      },
      {
        name: "defaultNotifyEmail",
        column: "default_notify_email",
        label: "Enquiry notifications to",
        kind: "email",
        help:
          "Where enquiries are emailed when a branch has no address of its own. Each branch " +
          "can override this.",
      },
      {
        name: "careersNotifyEmail",
        column: "careers_notify_email",
        label: "Job applications to",
        kind: "email",
      },
    ],
  },
  {
    title: "Brand",
    fields: [
      { name: "priceRange", column: "price_range", label: "Price range" },
      { name: "brandColor", column: "brand_color", label: "Brand colour", kind: "color" },
      {
        name: "themeColor",
        column: "theme_color",
        label: "Browser theme colour",
        kind: "color",
        help: "The colour mobile browsers tint their toolbar. Deliberately different from the brand colour.",
      },
    ],
  },
  {
    title: "Search engines",
    fields: [
      {
        name: "defaultSeoTitleTemplate",
        column: "default_seo_title_template",
        label: "Title template",
        help: 'Use %s where the page title goes — e.g. "%s | Bhargavi Health World".',
      },
      {
        name: "defaultSeoDescription",
        column: "default_seo_description",
        label: "Default description",
        kind: "textarea",
      },
      { name: "robotsAllow", column: "robots_allow", label: "Allow indexing", kind: "boolean" },
      {
        name: "analyticsMeasurementId",
        column: "analytics_measurement_id",
        label: "Analytics measurement id",
        help: "Leave empty until the clinic supplies one. Adding one also requires a privacy-policy update.",
      },
    ],
  },
];

export default function SettingsForm({ row }: { row: Record<string, unknown> }) {
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const group of GROUPS) {
      for (const field of group.fields) {
        const raw = row[field.column];
        initial[field.name] = field.kind === "boolean" ? raw === true : (raw ?? "");
      }
    }
    return initial;
  });

  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  // Whether the save that just succeeded can actually reach the public site.
  const [publishable, setPublishable] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const set = (name: string, value: unknown): void => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setState("idle");
    setError(undefined);
  };

  async function save(): Promise<void> {
    setState("saving");
    setError(undefined);

    const payload: Record<string, unknown> = {};
    for (const group of GROUPS) {
      for (const field of group.fields) {
        const value = values[field.name];
        if (field.kind === "boolean") payload[field.name] = value === true;
        else {
          const text = String(value ?? "").trim();
          payload[field.name] = text === "" ? null : text;
        }
      }
    }

    try {
      const response = await fetch("/api/admin/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Could not save (${String(response.status)}).`);
        setState("idle");
        return;
      }

      setPublishable(publishingConfiguredFrom(response));
      setState("saved");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setState("idle");
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {GROUPS.map((group) => (
        <section key={group.title} style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>{group.title}</h2>

          {group.fields.map((field) =>
            field.kind === "boolean" ? (
              <label key={field.name} style={{ display: "block", margin: "12px 0" }}>
                <input
                  type="checkbox"
                  checked={values[field.name] === true}
                  onChange={(e) => set(field.name, e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                <span style={{ fontSize: 14 }}>{field.label}</span>
                {field.help !== undefined && <Help>{field.help}</Help>}
              </label>
            ) : (
              <label key={field.name} style={{ display: "block", margin: "12px 0" }}>
                <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
                  {field.label}
                </span>

                {field.kind === "textarea" ? (
                  <textarea
                    value={String(values[field.name] ?? "")}
                    rows={3}
                    onChange={(e) => set(field.name, e.target.value)}
                    style={{ ...control, resize: "vertical", fontFamily: "inherit" }}
                  />
                ) : (
                  <input
                    type={field.kind === "email" ? "email" : "text"}
                    value={String(values[field.name] ?? "")}
                    onChange={(e) => set(field.name, e.target.value)}
                    style={control}
                    placeholder={field.kind === "color" ? "#44683d" : undefined}
                  />
                )}

                {field.help !== undefined && <Help>{field.help}</Help>}
              </label>
            ),
          )}
        </section>
      ))}

      {error !== undefined && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
          {error}
        </p>
      )}
      {state === "saved" && <SaveNotice configured={publishable} />}

      <button
        type="button"
        onClick={() => void save()}
        disabled={state === "saving"}
        style={{
          background: "var(--accent)",
          color: "var(--accent-text)",
          border: "none",
          borderRadius: "var(--radius)",
          padding: "9px 16px",
          cursor: "pointer",
          marginTop: 18,
        }}
      >
        {state === "saving" ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
      {children}
    </span>
  );
}

const control: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "#fff",
};
