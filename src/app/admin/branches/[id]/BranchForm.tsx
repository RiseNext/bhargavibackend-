"use client";

/**
 * The branch edit form.
 *
 * Calls `PATCH /api/admin/branches/{id}` — the same reasoning as every other
 * admin form: that endpoint already enforces the session, CSRF, the strict
 * field allowlist, the coordinate invariant, the single-primary rule, the audit
 * row and the deploy hook. A Server Action would be a second authorisation path
 * for the same mutation.
 *
 * 🔴 Two things this form has to make hard to get wrong:
 *
 *  1. **The D-013 trap.** `sortOrder` and `phoneSortOrder` are independent, and
 *     in live data they are exact reverses. They are therefore separated into
 *     their own fieldset with the consequence of each spelled out, never shown
 *     as one "order" field.
 *  2. **D-029 provenance.** Entering this branch's address does not necessarily
 *     change the footer — the site uses the first branch *by branch order* that
 *     has each field. The server returns `globalFieldProvenance`, and it is
 *     rendered here so that confusion is answered before it happens.
 *
 * Opening hours are per-day, multi-window (split shifts), so they get a real
 * editor rather than a JSON textarea — this is the field the clinic is most
 * likely to change, and the one D-005 exists for.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

const CSRF_COOKIE = "bhw_csrf";

function csrfToken(): string {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DAY_NUMBER: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

/**
 * Accepts either stored encoding and returns the numeric model.
 *
 * The seed wrote `day: "monday"`; the write schema accepts only `day: 0..6`.
 * A row in the older encoding must not read as "closed every day".
 */
function normaliseHours(raw: unknown): HoursDay[] {
  if (!Array.isArray(raw)) return [];

  const out: HoursDay[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { day?: unknown; windows?: unknown };

    const day =
      typeof e.day === "number"
        ? e.day
        : typeof e.day === "string"
          ? DAY_NUMBER[e.day.trim().toLowerCase()]
          : undefined;
    if (day === undefined || day < 0 || day > 6) continue;

    const windows = Array.isArray(e.windows)
      ? e.windows.flatMap((w) => {
          if (typeof w !== "object" || w === null) return [];
          const win = w as { open?: unknown; close?: unknown };
          return typeof win.open === "string" && typeof win.close === "string"
            ? [{ open: win.open, close: win.close }]
            : [];
        })
      : [];

    out.push({ day, windows });
  }
  return out.sort((a, b) => a.day - b.day);
}

interface HoursWindow {
  open: string;
  close: string;
}
interface HoursDay {
  day: number;
  windows: HoursWindow[];
}

type Values = Record<string, unknown>;

interface FieldSpec {
  name: string;
  label: string;
  kind?: "text" | "textarea" | "email" | "boolean" | "number" | "url";
  help?: string;
}

const GROUPS: Array<{ title: string; note?: string; fields: FieldSpec[] }> = [
  {
    title: "Identity",
    fields: [
      { name: "name", label: "Branch name" },
      {
        name: "slug",
        label: "Slug",
        help: "Lower-case words separated by hyphens. Used as a key, not as a public URL.",
      },
      {
        name: "isActive",
        label: "Active",
        kind: "boolean",
        help:
          "Turning this off hides the branch from the site. Branches are never deleted — that " +
          "would detach historical patient enquiries from their location.",
      },
      {
        name: "isPrimary",
        label: "Primary branch",
        kind: "boolean",
        help:
          "A label only. It does NOT decide which address or hours the site shows — see the " +
          "site-wide fields note below.",
      },
    ],
  },
  {
    title: "Phone and WhatsApp",
    fields: [
      { name: "phoneLabel", label: "Phone (as displayed)" },
      {
        name: "phoneE164",
        label: "Phone (international)",
        help: "Full international form, e.g. +919866376203.",
      },
      { name: "whatsappE164", label: "WhatsApp (international)" },
    ],
  },
  {
    title: "Address",
    note:
      "A partial address is still published as-is. Leave a line empty rather than guessing — " +
      "the site renders nothing for an empty field, never a placeholder.",
    fields: [
      { name: "addressLine1", label: "Line 1" },
      { name: "addressLine2", label: "Line 2" },
      { name: "addressCity", label: "City" },
      { name: "addressState", label: "State" },
      { name: "addressPostal", label: "Postcode" },
      { name: "addressCountry", label: "Country code", help: "Two letters, e.g. IN." },
      {
        name: "addressFull",
        label: "Full address (as displayed)",
        kind: "textarea",
        help: "This is the one the footer and contact cards actually render.",
      },
    ],
  },
  {
    title: "Map",
    note: "Latitude and longitude must be set together, or both left empty.",
    fields: [
      { name: "lat", label: "Latitude", kind: "number" },
      { name: "lng", label: "Longitude", kind: "number" },
      { name: "mapsUrl", label: "Google Maps link", kind: "url" },
      { name: "mapEmbedSrc", label: "Map embed src", kind: "url" },
    ],
  },
  {
    title: "Enquiry notifications",
    note:
      "The website sends no email (D-038). This address is stored for the clinic's own records " +
      "and is never exposed publicly.",
    fields: [{ name: "notifyEmail", label: "Notify email", kind: "email" }],
  },
];

export default function BranchForm({
  row,
  provenance,
  orderingWarning,
}: {
  row: Values;
  provenance: Record<string, string | null>;
  orderingWarning: string;
}) {
  const router = useRouter();
  const id = String(row.id ?? "");
  const slug = String(row.slug ?? "");

  const [values, setValues] = useState<Values>(() => {
    const out: Values = {};
    for (const group of GROUPS) {
      for (const field of group.fields) {
        const raw = row[field.name];
        out[field.name] = field.kind === "boolean" ? raw === true : (raw ?? "");
      }
    }
    out.sortOrder = row.sortOrder ?? 0;
    out.phoneSortOrder = row.phoneSortOrder ?? 0;
    return out;
  });

  // 🔴 `branches.hours` exists in the database in TWO encodings: the seed wrote
  // `day` as a day-NAME string ("monday"), while the write schema and
  // `HoursDay` use the numeric 0–6 model. Reading the seeded rows without
  // normalising would show every day as Closed and then overwrite a real
  // seven-day schedule on save. Normalise in, always write numeric out.
  const [hours, setHours] = useState<HoursDay[]>(() => normaliseHours(row.hours));
  const [hoursSet, setHoursSet] = useState(() => Array.isArray(row.hours));

  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | undefined>();

  const set = (name: string, value: unknown): void => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setState("idle");
    setError(undefined);
  };

  const touchHours = (next: HoursDay[]): void => {
    setHours(next);
    setHoursSet(true);
    setState("idle");
    setError(undefined);
  };

  /** Fields this branch currently supplies to the whole site (D-029). */
  const owns = Object.entries(provenance)
    .filter(([, owner]) => owner === slug)
    .map(([field]) => field);

  async function save(): Promise<void> {
    setState("saving");
    setError(undefined);

    const payload: Values = {};

    for (const group of GROUPS) {
      for (const field of group.fields) {
        const value = values[field.name];

        if (field.kind === "boolean") {
          payload[field.name] = value === true;
          continue;
        }

        const text = String(value ?? "").trim();

        if (field.kind === "number") {
          // null, not 0 — an empty coordinate means "unknown", and 0 is a real
          // place in the Gulf of Guinea.
          payload[field.name] = text === "" ? null : Number(text);
          continue;
        }

        payload[field.name] = text === "" ? null : text;
      }
    }

    payload.sortOrder = Number(values.sortOrder ?? 0);
    payload.phoneSortOrder = Number(values.phoneSortOrder ?? 0);

    // `hours: null` means "no hours recorded" and is meaningfully different
    // from an empty array, which would mean "closed every day".
    payload.hours = hoursSet ? hours : null;

    try {
      const response = await fetch(`/api/admin/branches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
        body: JSON.stringify(payload),
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

  return (
    <div style={{ maxWidth: 760 }}>
      {/* ── D-029: why editing this branch may change nothing ──────────── */}
      <p style={owns.length > 0 ? okBox : warnBox}>
        {owns.length > 0 ? (
          <>
            This branch supplies the site-wide <strong>{owns.join(", ")}</strong>. Changing those
            fields here changes them across the whole website.
          </>
        ) : (
          <>
            <strong>This branch supplies no site-wide fields.</strong> The footer, contact cards
            and search-engine data use the first branch <em>in the branch order</em> that has each
            field. Filling in this branch&apos;s address or hours will not change them unless its
            branch order changes.
          </>
        )}
      </p>

      {GROUPS.map((group) => (
        <section key={group.title} style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>{group.title}</h2>
          {group.note !== undefined && <Help>{group.note}</Help>}

          {group.fields.map((field) =>
            field.kind === "boolean" ? (
              <label key={field.name} style={{ display: "block", margin: "12px 0" }}>
                <input
                  type="checkbox"
                  checked={values[field.name] === true}
                  disabled={state === "saving"}
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
                    disabled={state === "saving"}
                    onChange={(e) => set(field.name, e.target.value)}
                    style={{ ...control, resize: "vertical", fontFamily: "inherit" }}
                  />
                ) : (
                  <input
                    type={
                      field.kind === "email"
                        ? "email"
                        : field.kind === "number"
                          ? "number"
                          : field.kind === "url"
                            ? "url"
                            : "text"
                    }
                    step={field.kind === "number" ? "any" : undefined}
                    value={String(values[field.name] ?? "")}
                    disabled={state === "saving"}
                    onChange={(e) => set(field.name, e.target.value)}
                    style={control}
                  />
                )}

                {field.help !== undefined && <Help>{field.help}</Help>}
              </label>
            ),
          )}
        </section>
      ))}

      {/* ── 🔴 The two independent orderings (D-013) ───────────────────── */}
      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 15, marginBottom: 6 }}>Ordering</h2>
        <p style={warnBox}>{orderingWarning}</p>

        <label style={{ display: "block", margin: "12px 0" }}>
          <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Branch order</span>
          <input
            type="number"
            value={String(values.sortOrder ?? 0)}
            disabled={state === "saving"}
            onChange={(e) => set("sortOrder", e.target.value)}
            style={{ ...control, maxWidth: 120 }}
          />
          <Help>
            Lower comes first. Controls the branch list, and — through it — which branch supplies
            the site-wide address, hours and map.
          </Help>
        </label>

        <label style={{ display: "block", margin: "12px 0" }}>
          <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
            Phone number order
          </span>
          <input
            type="number"
            value={String(values.phoneSortOrder ?? 0)}
            disabled={state === "saving"}
            onChange={(e) => set("phoneSortOrder", e.target.value)}
            style={{ ...control, maxWidth: 120 }}
          />
          <Help>
            Separate from the branch order. Lower comes first, and the first number is the one the
            floating call button, the contact hero and the closing call-to-action all show.
          </Help>
        </label>
      </section>

      {/* ── Opening hours (D-005) ──────────────────────────────────────── */}
      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 15, marginBottom: 6 }}>Opening hours</h2>

        {!hoursSet && (
          <p style={warnBox}>
            No hours are recorded for this branch. The site shows nothing rather than guessing.
          </p>
        )}

        {DAYS.map((label, day) => {
          const entry = hours.find((h) => h.day === day);
          const windows = entry?.windows ?? [];

          return (
            <div key={day} style={{ ...box, marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14, minWidth: 92 }}>{label}</strong>

                {windows.length === 0 && (
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>Closed</span>
                )}

                <span style={{ flex: 1 }} />

                <button
                  type="button"
                  disabled={state === "saving" || windows.length >= 4}
                  onClick={() => {
                    const next = hours.filter((h) => h.day !== day);
                    next.push({ day, windows: [...windows, { open: "09:00", close: "21:00" }] });
                    touchHours(next.sort((a, b) => a.day - b.day));
                  }}
                  style={{ ...secondary, padding: "4px 10px" }}
                >
                  Add hours
                </button>
              </div>

              {windows.map((w, index) => (
                <div
                  key={index}
                  style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}
                >
                  <input
                    type="time"
                    value={w.open}
                    disabled={state === "saving"}
                    onChange={(e) => {
                      const next = hours.map((h) =>
                        h.day === day
                          ? {
                              ...h,
                              windows: h.windows.map((x, i) =>
                                i === index ? { ...x, open: e.target.value } : x,
                              ),
                            }
                          : h,
                      );
                      touchHours(next);
                    }}
                    style={{ ...control, maxWidth: 130 }}
                  />
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>to</span>
                  <input
                    type="time"
                    value={w.close}
                    disabled={state === "saving"}
                    onChange={(e) => {
                      const next = hours.map((h) =>
                        h.day === day
                          ? {
                              ...h,
                              windows: h.windows.map((x, i) =>
                                i === index ? { ...x, close: e.target.value } : x,
                              ),
                            }
                          : h,
                      );
                      touchHours(next);
                    }}
                    style={{ ...control, maxWidth: 130 }}
                  />
                  <button
                    type="button"
                    disabled={state === "saving"}
                    aria-label={`Remove ${label} window ${String(index + 1)}`}
                    onClick={() => {
                      const remaining = windows.filter((_, i) => i !== index);
                      const next = hours.filter((h) => h.day !== day);
                      if (remaining.length > 0) next.push({ day, windows: remaining });
                      touchHours(next.sort((a, b) => a.day - b.day));
                    }}
                    style={{ ...secondary, padding: "4px 10px", color: "var(--danger)" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          );
        })}

        <Help>
          A day with no hours is closed. Two windows on one day are a split shift — both are
          published.
        </Help>
      </section>

      {error !== undefined && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 16 }}>
          {error}
        </p>
      )}
      {state === "saved" && (
        <p style={{ color: "var(--ok)", fontSize: 13, marginTop: 16 }}>
          Saved. A site rebuild has been queued — changes appear in a couple of minutes.
        </p>
      )}

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
        {state === "saving" ? "Saving…" : "Save branch"}
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

const secondary: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "9px 14px",
  cursor: "pointer",
};

const box: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: 12,
};

const warnBox: React.CSSProperties = {
  background: "#fff8e6",
  border: "1px solid var(--warn)",
  borderRadius: "var(--radius)",
  padding: 12,
  fontSize: 13,
};

const okBox: React.CSSProperties = {
  background: "#e8f1e6",
  border: "1px solid var(--ok)",
  borderRadius: "var(--radius)",
  padding: 12,
  fontSize: 13,
};
