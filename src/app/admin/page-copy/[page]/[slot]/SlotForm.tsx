"use client";

/**
 * The page-copy slot editor.
 *
 * Calls `PUT /api/admin/content-blocks/{page}/{slot}` — session, CSRF, the
 * strict field allowlist, the `extra` key allowlist, the audit row and the
 * deploy hook all live there.
 *
 * 🔴 `extra` is rendered as NAMED fields from the server's `allowedExtraKeys`,
 * never as a JSON textarea. That is the whole point of D-024's allowlist: an
 * editor who mistypes a key in free-text JSON gets a 422 they cannot act on,
 * and one who guesses a plausible-looking key saves content no page renders.
 *
 * ⚠ `title` may carry `*emphasis*` markers (D-037). The parser turns them into
 * the italic span the headings already use, so they are explained rather than
 * stripped — losing them would silently change ten rendered headings.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

const CSRF_COOKIE = "bhw_csrf";

function csrfToken(): string {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export interface SlotRow {
  page: string;
  slot: string;
  label: string | null;
  title: string | null;
  lead: string | null;
  body: string[] | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  cta2Label: string | null;
  cta2Href: string | null;
  extra: Record<string, unknown> | null;
}

export default function SlotForm({
  row,
  allowedExtraKeys,
}: {
  row: SlotRow;
  allowedExtraKeys: readonly string[];
}) {
  const router = useRouter();

  const [label, setLabel] = useState(row.label ?? "");
  const [title, setTitle] = useState(row.title ?? "");
  const [lead, setLead] = useState(row.lead ?? "");
  const [body, setBody] = useState<string[]>(row.body ?? []);
  const [ctaLabel, setCtaLabel] = useState(row.ctaLabel ?? "");
  const [ctaHref, setCtaHref] = useState(row.ctaHref ?? "");
  const [cta2Label, setCta2Label] = useState(row.cta2Label ?? "");
  const [cta2Href, setCta2Href] = useState(row.cta2Href ?? "");

  const [extra, setExtra] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const key of allowedExtraKeys) {
      const value = row.extra?.[key];
      out[key] = typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value);
    }
    return out;
  });

  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | undefined>();

  const touch = (): void => {
    setState("idle");
    setError(undefined);
  };

  async function save(): Promise<void> {
    setState("saving");
    setError(undefined);

    const blank = (v: string): string | null => (v.trim() === "" ? null : v.trim());

    const extraPayload: Record<string, unknown> = {};
    for (const key of allowedExtraKeys) {
      const value = extra[key] ?? "";
      if (value.trim() !== "") extraPayload[key] = value.trim();
    }

    const payload = {
      label: blank(label),
      title: blank(title),
      lead: blank(lead),
      // An empty list is meaningfully different from "no body": the former
      // renders nothing, the latter means this slot has no body at all.
      body: body.filter((p) => p.trim() !== "").length > 0
        ? body.filter((p) => p.trim() !== "")
        : null,
      ctaLabel: blank(ctaLabel),
      ctaHref: blank(ctaHref),
      cta2Label: blank(cta2Label),
      cta2Href: blank(cta2Href),
      extra: Object.keys(extraPayload).length > 0 ? extraPayload : null,
    };

    try {
      const response = await fetch(
        `/api/admin/content-blocks/${encodeURIComponent(row.page)}/${encodeURIComponent(row.slot)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const b = (await response.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? `Could not save (${String(response.status)}).`);
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

  const hasEmphasis = /\*[^*]+\*/.test(title);

  return (
    <div style={{ maxWidth: 760 }}>
      <Text label="Section label" value={label} onChange={(v) => { setLabel(v); touch(); }}
        help="The small caption above a heading, where the section has one." disabled={state === "saving"} />

      <Text label="Heading" value={title} onChange={(v) => { setTitle(v); touch(); }}
        help="Wrap a word or phrase in *asterisks* to show it in italics, as the site already does."
        disabled={state === "saving"} />

      {hasEmphasis && (
        <p style={{ ...okBox, marginTop: -6 }}>
          Italics preview: {renderEmphasis(title)}
        </p>
      )}

      <Area label="Lead paragraph" value={lead} onChange={(v) => { setLead(v); touch(); }}
        rows={3} disabled={state === "saving"} />

      {/* ── body paragraphs ───────────────────────────────────────────── */}
      <div style={{ margin: "14px 0" }}>
        <span style={labelStyle}>Body paragraphs</span>
        {body.map((paragraph, index) => (
          <div key={index} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <textarea
              value={paragraph}
              rows={2}
              disabled={state === "saving"}
              onChange={(e) => {
                const next = [...body];
                next[index] = e.target.value;
                setBody(next);
                touch();
              }}
              style={{ ...control, resize: "vertical", fontFamily: "inherit" }}
            />
            <button
              type="button"
              disabled={state === "saving"}
              aria-label={`Remove paragraph ${String(index + 1)}`}
              onClick={() => { setBody(body.filter((_, i) => i !== index)); touch(); }}
              style={{ ...secondary, padding: "4px 10px", color: "var(--danger)" }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={state === "saving" || body.length >= 40}
          onClick={() => { setBody([...body, ""]); touch(); }}
          style={{ ...secondary, padding: "4px 10px" }}
        >
          Add paragraph
        </button>
      </div>

      {/* ── calls to action ──────────────────────────────────────────── */}
      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 15, marginBottom: 6 }}>Buttons</h2>
        <Help>
          Leave a pair empty to hide that button. A label with no link, or a link with no label,
          renders nothing.
        </Help>
        <Text label="Button text" value={ctaLabel} onChange={(v) => { setCtaLabel(v); touch(); }} disabled={state === "saving"} />
        <Text label="Button link" value={ctaHref} onChange={(v) => { setCtaHref(v); touch(); }} disabled={state === "saving"} />
        <Text label="Second button text" value={cta2Label} onChange={(v) => { setCta2Label(v); touch(); }} disabled={state === "saving"} />
        <Text label="Second button link" value={cta2Href} onChange={(v) => { setCta2Href(v); touch(); }} disabled={state === "saving"} />
      </section>

      {/* ── extra, as named fields (D-024) ──────────────────────────── */}
      {allowedExtraKeys.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Additional text on this section</h2>
          <Help>
            These fields exist only on this section. The list is fixed — the page renders exactly
            these and nothing else.
          </Help>
          {allowedExtraKeys.map((key) => (
            <Text
              key={key}
              label={humanise(key)}
              value={extra[key] ?? ""}
              onChange={(v) => { setExtra({ ...extra, [key]: v }); touch(); }}
              disabled={state === "saving"}
            />
          ))}
        </section>
      )}

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
        {state === "saving" ? "Saving…" : "Save section"}
      </button>
    </div>
  );
}

/** `*word*` → italics, matching the frontend's own emphasis convention. */
function renderEmphasis(text: string): React.ReactNode {
  return text.split(/(\*[^*]+\*)/).map((part, i) =>
    part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
      <em key={i}>{part.slice(1, -1)}</em>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/** `formCardTitle` → "Form card title". */
function humanise(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function Text({
  label, value, onChange, help, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  disabled: boolean;
}) {
  return (
    <label style={{ display: "block", margin: "12px 0" }}>
      <span style={labelStyle}>{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={control}
      />
      {help !== undefined && <Help>{help}</Help>}
    </label>
  );
}

function Area({
  label, value, onChange, rows, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  disabled: boolean;
}) {
  return (
    <label style={{ display: "block", margin: "12px 0" }}>
      <span style={labelStyle}>{label}</span>
      <textarea
        value={value}
        rows={rows}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...control, resize: "vertical", fontFamily: "inherit" }}
      />
    </label>
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
      {children}
    </span>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  marginBottom: 4,
};

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

const okBox: React.CSSProperties = {
  background: "#e8f1e6",
  border: "1px solid var(--ok)",
  borderRadius: "var(--radius)",
  padding: 10,
  fontSize: 13,
};
