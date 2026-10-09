"use client";

/**
 * The image field — choose from the library, or upload a new one.
 *
 * `ui-schema.ts` has declared four fields as `kind: "media"` from the start
 * (service image, gallery image, post cover, list icon) but `RecordForm`'s
 * `Field` had no `media` branch, so every one of them fell through to a plain
 * text input. The only way to set an image was to paste a media UUID, and the
 * gallery requires one — so an administrator could not add a gallery tile at
 * all. The whole signed-upload API (E7) had no user interface.
 *
 * 🔴 The file goes STRAIGHT to Cloudinary (D-014). It never passes through this
 * backend, so there is no request-body ceiling to hit and the API secret never
 * leaves the server. The sequence is:
 *
 *   POST /api/admin/media/signature  → signed params for a server-chosen public_id
 *   POST  <cloudinary>               → the browser uploads the bytes directly
 *   POST /api/admin/media/confirm    → verification; THIS is where size/format
 *                                      are enforced, and a rejection destroys
 *                                      the asset (D-039 C-1)
 *
 * The size check here is advisory only, exactly as the signature response says:
 * it saves the editor a pointless upload, and `confirm` remains the authority.
 */

import { useEffect, useState } from "react";

const CSRF_COOKIE = "bhw_csrf";

function csrfToken(): string {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

/** Folders the signature endpoint accepts. Not free text. */
const FOLDERS = ["services", "gallery", "icons", "brand", "blog"] as const;

interface MediaRow {
  id: string;
  publicId: string;
  secureUrl: string | null;
  altDefault: string | null;
  width: number | null;
  height: number | null;
  visibility: string;
  resourceType: string;
}

export default function MediaPicker({
  value,
  onChange,
  disabled,
  label,
  required,
}: {
  value: string;
  onChange: (id: string | null) => void;
  disabled: boolean;
  label: string;
  required?: boolean;
}) {
  const [library, setLibrary] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [open, setOpen] = useState(false);

  const [folder, setFolder] = useState<(typeof FOLDERS)[number]>("services");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | undefined>();

  async function load(): Promise<void> {
    setLoading(true);
    setLoadError(undefined);
    try {
      // Only public images are selectable: a private resume must never become a
      // public tile, and the gallery validator rejects one anyway.
      const response = await fetch(
        "/api/admin/media?visibility=public&resourceType=image&limit=200",
      );
      if (!response.ok) {
        setLoadError(`Could not load the image library (${String(response.status)}).`);
        setLoading(false);
        return;
      }
      const body = (await response.json()) as { items?: MediaRow[] };
      setLibrary(body.items ?? []);
    } catch {
      setLoadError("Could not reach the server.");
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = library.find((m) => m.id === value);

  async function upload(file: File): Promise<void> {
    setUploading(true);
    setUploadError(undefined);

    try {
      const signRes = await fetch("/api/admin/media/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
        body: JSON.stringify({ folder, filename: file.name }),
      });

      if (!signRes.ok) {
        const b = (await signRes.json().catch(() => ({}))) as { error?: string };
        setUploadError(b.error ?? `Could not start the upload (${String(signRes.status)}).`);
        setUploading(false);
        return;
      }

      const signed = (await signRes.json()) as {
        uploadUrl: string;
        fields: Record<string, string>;
        publicId: string;
        maxBytes: number;
        allowedFormats: string[];
      };

      // Advisory, pre-flight only — `confirm` is the enforcement point.
      if (file.size > signed.maxBytes) {
        setUploadError(
          `That image is ${Math.round(file.size / 1024)} KB. The limit is ` +
            `${Math.round(signed.maxBytes / 1024)} KB — please resize it and try again.`,
        );
        setUploading(false);
        return;
      }

      const form = new FormData();
      for (const [key, v] of Object.entries(signed.fields)) form.append(key, v);
      form.append("file", file);

      const cloudRes = await fetch(signed.uploadUrl, { method: "POST", body: form });
      if (!cloudRes.ok) {
        setUploadError(
          "The image storage service refused the upload. Check that the file really is a " +
            `${signed.allowedFormats.join(", ")} image.`,
        );
        setUploading(false);
        return;
      }

      const confirmRes = await fetch("/api/admin/media/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
        body: JSON.stringify({
          publicId: signed.publicId,
          altDefault: file.name.replace(/\.[A-Za-z0-9]+$/, ""),
        }),
      });

      if (!confirmRes.ok) {
        const b = (await confirmRes.json().catch(() => ({}))) as { error?: string };
        // The asset has already been destroyed server-side by this point, so
        // there is nothing to clean up here — say so plainly.
        setUploadError(b.error ?? `The upload was rejected (${String(confirmRes.status)}).`);
        setUploading(false);
        return;
      }

      const row = (await confirmRes.json()) as MediaRow;
      setLibrary((previous) => [row, ...previous]);
      onChange(row.id);
      setOpen(false);
    } catch {
      setUploadError("Could not reach the server.");
    }
    setUploading(false);
  }

  return (
    <div style={{ margin: "14px 0" }}>
      <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
        {label}
        {required === true && <span style={{ color: "var(--danger)" }}> *</span>}
      </span>

      {/* ── what is currently chosen ─────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 10,
          background: "#fff",
        }}
      >
        {selected?.secureUrl != null ? (
          // A plain <img>, not next/image: this is an admin-only preview of an
          // already-optimised Cloudinary asset, on a screen no visitor reaches.
          <img
            src={selected.secureUrl}
            alt={selected.altDefault ?? ""}
            style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 4 }}
          />
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 4,
              background: "#f1f0ec",
              display: "grid",
              placeItems: "center",
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            none
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {value === "" ? (
            <span style={{ fontSize: 13, color: "var(--muted)" }}>No image chosen.</span>
          ) : selected ? (
            <span style={{ fontSize: 13 }}>{selected.publicId}</span>
          ) : (
            // The field holds an id that is not in the library — a private or
            // deleted asset. Say so rather than rendering a blank box.
            <span style={{ fontSize: 13, color: "var(--warn)" }}>
              Image {value.slice(0, 8)}… is not in the public image library.
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          style={secondary}
        >
          {open ? "Close" : value === "" ? "Choose image" : "Change"}
        </button>

        {value !== "" && (
          <button
            type="button"
            disabled={disabled || required === true}
            onClick={() => onChange(null)}
            title={required === true ? "This image is required." : undefined}
            style={{ ...secondary, color: required === true ? "var(--muted)" : "var(--danger)" }}
          >
            Remove
          </button>
        )}
      </div>

      {/* ── the picker ───────────────────────────────────────────────── */}
      {open && (
        <div style={{ ...box, marginTop: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 13 }}>
              Upload into{" "}
              <select
                value={folder}
                disabled={uploading}
                onChange={(e) => setFolder(e.target.value as (typeof FOLDERS)[number])}
                style={{ padding: "6px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
              >
                {FOLDERS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={uploading || disabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset the input so re-choosing the same file fires again.
                e.target.value = "";
                if (file) void upload(file);
              }}
              style={{ fontSize: 13 }}
            />

            {uploading && <span style={{ fontSize: 13, color: "var(--muted)" }}>Uploading…</span>}
          </div>

          {uploadError !== undefined && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
              {uploadError}
            </p>
          )}

          <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "12px 0" }} />

          {loading ? (
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Loading images…</p>
          ) : loadError !== undefined ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
              {loadError}{" "}
              <button type="button" onClick={() => void load()} style={secondary}>
                Retry
              </button>
            </p>
          ) : library.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
              The image library is empty. Upload one above.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                gap: 8,
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {library.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  title={m.publicId}
                  style={{
                    padding: 0,
                    border:
                      m.id === value ? "2px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: 4,
                    background: "none",
                    cursor: "pointer",
                    overflow: "hidden",
                    aspectRatio: "1 / 1",
                  }}
                >
                  {m.secureUrl != null ? (
                    // Plain <img> for the same reason as the preview above.
                    <img
                      src={m.secureUrl}
                      alt={m.altDefault ?? m.publicId}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>no preview</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 0 }}>
            {library.length} image{library.length === 1 ? "" : "s"} in the library. Only public
            images appear here — uploaded CVs are private and can never be used as site images.
          </p>
        </div>
      )}
    </div>
  );
}

const secondary: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "7px 12px",
  cursor: "pointer",
  fontSize: 13,
};

const box: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: 12,
};
