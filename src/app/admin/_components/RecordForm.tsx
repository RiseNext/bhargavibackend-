"use client";

/**
 * The one record form every collection screen uses.
 *
 * It calls the existing admin API rather than a Server Action, deliberately:
 * those endpoints already enforce `requireAdminMutation` (session + CSRF), the
 * strict field allowlist, the audit row and the deploy hook, and the route-tree
 * guard holds them to it. A Server Action would be a SECOND authorisation path
 * for the same mutation, which is how one of them ends up weaker.
 *
 * Every state the blueprint's admin inventory requires is here: loading,
 * saved, validation error, server error, and a confirmation before anything
 * destructive.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  paiseFromRupees,
  rupeesFromPaise,
  type CollectionUi,
  type FieldSpec,
} from "@/lib/admin/ui-schema";
import MediaPicker from "./MediaPicker";

const CSRF_COOKIE = "bhw_csrf";

/** The double-submit token. Readable by design — that is the mechanism. */
function csrfToken(): string {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

type Values = Record<string, unknown>;

/** Database row (snake_case) → form values (camelCase), per the descriptor. */
function toFormValues(ui: CollectionUi, row: Values | undefined): Values {
  const out: Values = {};
  if (!row) {
    for (const field of ui.fields) {
      out[field.name] =
        field.kind === "boolean" ? false : field.kind === "stringList" ? [] : "";
    }
    return out;
  }

  for (const field of ui.fields) {
    const column = field.name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    const raw = row[column] ?? row[field.name];

    if (field.kind === "paise") {
      out[field.name] = rupeesFromPaise(raw as number | null);
    } else if (field.kind === "stringList") {
      out[field.name] = Array.isArray(raw) ? raw : [];
    } else if (field.kind === "boolean") {
      out[field.name] = raw === true;
    } else if (field.kind === "date") {
      out[field.name] = typeof raw === "string" ? raw.slice(0, 10) : "";
    } else {
      out[field.name] = raw ?? "";
    }
  }
  return out;
}

/** Form values → API payload. Empty optional fields become null, not "". */
function toPayload(ui: CollectionUi, values: Values): Values {
  const out: Values = {};

  for (const field of ui.fields) {
    const value = values[field.name];

    switch (field.kind) {
      case "boolean":
        out[field.name] = value === true;
        break;
      case "paise":
        out[field.name] = paiseFromRupees(String(value ?? ""));
        break;
      case "number": {
        const text = String(value ?? "").trim();
        out[field.name] = text === "" ? null : Number(text);
        break;
      }
      case "stringList":
        out[field.name] = Array.isArray(value) ? value.filter((v) => String(v).trim() !== "") : [];
        break;
      default: {
        const text = String(value ?? "").trim();
        // A required field keeps "" so the API's own validator produces the
        // message, rather than the form inventing one.
        out[field.name] = text === "" ? (field.required ? "" : null) : text;
      }
    }
  }
  return out;
}

/** Options a field declared via `optionsFrom`, resolved by the server screen. */
export type DynamicOptions = Record<string, ReadonlyArray<{ value: string; label: string }>>;

export default function RecordForm({
  ui,
  row,
  id,
  dynamicOptions,
}: {
  ui: CollectionUi;
  row?: Values;
  id?: string;
  dynamicOptions?: DynamicOptions;
}) {
  const router = useRouter();
  const isNew = id === undefined;
  const published = row?.published === true || row?.status === "published";

  const [values, setValues] = useState<Values>(() => toFormValues(ui, row));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | undefined>();

  const set = (name: string, value: unknown): void => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setState("idle");
    setError(undefined);
  };

  async function call(path: string, method: string, body?: unknown): Promise<Response> {
    return fetch(path, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function save(): Promise<void> {
    setState("saving");
    setError(undefined);

    const payload = toPayload(ui, values);

    // A published slug is a live URL; the API rejects the change, so the form
    // does not send it at all.
    if (!isNew) {
      for (const field of ui.fields) {
        if (field.immutableWhenPublished && published) delete payload[field.name];
      }
    }

    try {
      const response = await call(
        isNew ? `/api/admin/${ui.slug}` : `/api/admin/${ui.slug}/${id ?? ""}`,
        isNew ? "POST" : "PATCH",
        payload,
      );

      if (!response.ok) {
        // The API's message is the useful one — it names the field and the rule.
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Could not save (${String(response.status)}).`);
        setState("idle");
        return;
      }

      setState("saved");
      if (isNew) {
        const created = (await response.json()) as { id?: string };
        if (created.id) {
          router.push(`/admin/content/${ui.slug}/${created.id}`);
          return;
        }
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setState("idle");
    }
  }

  async function togglePublish(next: boolean): Promise<void> {
    if (!next && !confirm("Unpublish this? It will disappear from the public site at the next rebuild.")) {
      return;
    }
    setState("saving");
    const response = await call(`/api/admin/${ui.slug}/${id ?? ""}/publish`, "POST", {
      published: next,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not change the publish state.");
      setState("idle");
      return;
    }
    setState("idle");
    router.refresh();
  }

  async function remove(): Promise<void> {
    // Confirmation on every destructive action (blueprint §F.2).
    if (!confirm("Delete this? It is recoverable by a developer, but it will disappear from the site.")) {
      return;
    }
    setState("saving");
    const response = await call(`/api/admin/${ui.slug}/${id ?? ""}`, "DELETE");
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not delete.");
      setState("idle");
      return;
    }
    router.push(`/admin/content/${ui.slug}`);
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {ui.notice !== undefined && (
        <p
          style={{
            background: "#fff8e6",
            border: "1px solid var(--warn)",
            borderRadius: "var(--radius)",
            padding: 12,
            fontSize: 13,
          }}
        >
          {ui.notice}
        </p>
      )}

      {ui.fields.map((field) => (
        <Field
          key={field.name}
          field={field}
          value={values[field.name]}
          disabled={state === "saving" || (field.immutableWhenPublished === true && published && !isNew)}
          onChange={(value) => set(field.name, value)}
          {...(field.optionsFrom && dynamicOptions?.[field.optionsFrom]
            ? { resolvedOptions: dynamicOptions[field.optionsFrom] }
            : {})}
        />
      ))}

      {error !== undefined && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
          {error}
        </p>
      )}
      {state === "saved" && (
        <p style={{ color: "var(--ok)", fontSize: 13 }}>
          Saved. A site rebuild has been queued — changes appear in a couple of minutes.
        </p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <button type="button" onClick={() => void save()} disabled={state === "saving"} style={primary}>
          {state === "saving" ? "Saving…" : isNew ? "Create" : "Save"}
        </button>

        {!isNew && ui.canPublish && (
          <button type="button" onClick={() => void togglePublish(!published)} style={secondary}>
            {published ? "Unpublish" : "Publish"}
          </button>
        )}

        {!isNew && ui.canDelete && (
          <button
            type="button"
            onClick={() => void remove()}
            style={{ ...secondary, color: "var(--danger)", borderColor: "var(--danger)" }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  field,
  value,
  disabled,
  onChange,
  resolvedOptions,
}: {
  field: FieldSpec;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
  /** Row-backed options for a field declared with `optionsFrom`. */
  resolvedOptions?: ReadonlyArray<{ value: string; label: string }>;
}) {
  const label = (
    <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
      {field.label}
      {field.required === true && <span style={{ color: "var(--danger)" }}> *</span>}
    </span>
  );

  const help =
    field.help !== undefined ? (
      <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
        {field.help}
      </span>
    ) : null;

  if (field.kind === "boolean") {
    return (
      <label style={{ display: "block", margin: "14px 0" }}>
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{ marginRight: 8 }}
        />
        <span style={{ fontSize: 14 }}>{field.label}</span>
        {help}
      </label>
    );
  }

  if (field.kind === "select") {
    const options = resolvedOptions ?? field.options ?? [];
    const current = String(value ?? "");
    // A row-backed value that is no longer among the options — a deactivated or
    // deleted branch. Say so rather than silently showing "—", which would look
    // like "all branches" and quietly change what the job means on save.
    const orphaned = current !== "" && !options.some((o) => o.value === current);
    const emptySource = field.optionsFrom !== undefined && options.length === 0;

    return (
      <label style={{ display: "block", margin: "14px 0" }}>
        {label}
        <select
          value={current}
          disabled={disabled || emptySource}
          onChange={(e) => onChange(e.target.value)}
          style={control}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {orphaned && (
            <option value={current}>
              {current.slice(0, 8)}… (no longer available)
            </option>
          )}
        </select>
        {emptySource && (
          <span style={{ display: "block", fontSize: 12, color: "var(--warn)", marginTop: 4 }}>
            No branches are available to choose from. Add a branch first.
          </span>
        )}
        {orphaned && (
          <span style={{ display: "block", fontSize: 12, color: "var(--warn)", marginTop: 4 }}>
            The saved value is not in the current list — it may have been deactivated. Choose
            again, or leave it to keep it unchanged.
          </span>
        )}
        {help}
      </label>
    );
  }

  if (field.kind === "stringList") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div style={{ margin: "14px 0" }}>
        {label}
        {list.map((item, index) => (
          <div key={index} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input
              value={item}
              disabled={disabled}
              onChange={(e) => {
                const next = [...list];
                next[index] = e.target.value;
                onChange(next);
              }}
              style={control}
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, i) => i !== index))}
              disabled={disabled}
              style={{ ...secondary, padding: "4px 10px" }}
              aria-label={`Remove item ${String(index + 1)}`}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...list, ""])}
          disabled={disabled}
          style={{ ...secondary, padding: "4px 10px" }}
        >
          Add item
        </button>
        {help}
      </div>
    );
  }

  // 🔴 Four fields are declared `kind: "media"` in `ui-schema.ts`. Without this
  // branch they fell through to the plain text input below, so setting an image
  // meant pasting a media UUID — and `gallery.mediaId` is required, which made
  // adding a gallery tile impossible through the admin.
  if (field.kind === "media") {
    return (
      <MediaPicker
        label={field.label}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        required={field.required}
        onChange={(id) => onChange(id)}
      />
    );
  }

  if (field.kind === "textarea") {
    return (
      <label style={{ display: "block", margin: "14px 0" }}>
        {label}
        <textarea
          value={String(value ?? "")}
          disabled={disabled}
          rows={4}
          maxLength={field.max}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...control, resize: "vertical", fontFamily: "inherit" }}
        />
        {help}
      </label>
    );
  }

  const inputType =
    field.kind === "number" || field.kind === "paise"
      ? "number"
      : field.kind === "date"
        ? "date"
        : field.kind === "url"
          ? "url"
          : field.kind === "email"
            ? "email"
            : "text";

  return (
    <label style={{ display: "block", margin: "14px 0" }}>
      {label}
      <input
        type={inputType}
        value={String(value ?? "")}
        disabled={disabled}
        maxLength={field.kind === "number" || field.kind === "paise" ? undefined : field.max}
        onChange={(e) => onChange(e.target.value)}
        style={control}
      />
      {disabled && field.immutableWhenPublished === true && (
        <span style={{ display: "block", fontSize: 12, color: "var(--warn)", marginTop: 4 }}>
          Locked because this is published — the URL is live.
        </span>
      )}
      {help}
    </label>
  );
}

const control: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "#fff",
};

const primary: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--accent-text)",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "9px 16px",
  cursor: "pointer",
};

const secondary: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "9px 14px",
  cursor: "pointer",
};
