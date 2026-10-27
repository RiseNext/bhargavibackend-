"use client";

/**
 * The slider manager — upload, preview, reorder, remove, choose the main image.
 *
 * Used by the service edit screen for `service_images` (D-044). One service's
 * collection is entirely independent of another's: every request goes to
 * `/api/admin/services/{serviceId}/images`, and the server scopes every write
 * by that id as well, so this screen cannot touch a sibling service even if it
 * tried.
 *
 * 🔴 UPLOADING IS NOT REIMPLEMENTED HERE. `MediaPicker` already owns the whole
 * signed-upload sequence (signature → direct-to-Cloudinary → confirm, D-014)
 * plus the library browser and its error states. This component uses it as the
 * "which image" control and adds only the collection semantics around it.
 * Duplicating the upload flow would mean two places to keep correct.
 *
 * ⚠ After every successful write this calls `router.refresh()` rather than
 * patching local state, matching `ReorderButtons`: the server component owns
 * the order and the default, so re-reading is the only way to be sure the
 * screen shows what the database actually holds. A failed write therefore
 * leaves the list visibly unchanged, which is the honest outcome.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import MediaPicker from "./MediaPicker";

const CSRF_COOKIE = "bhw_csrf";

function csrfToken(): string {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export interface SlideRow {
  id: string;
  mediaId: string;
  alt: string;
  sortOrder: number;
  isDefault: boolean;
  secureUrl: string | null;
}

export default function ImageCollectionEditor({
  serviceId,
  rows,
}: {
  serviceId: string;
  rows: SlideRow[];
}) {
  const router = useRouter();
  const base = `/api/admin/services/${serviceId}/images`;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  // The pending addition: an image chosen but not yet saved as a slide.
  const [newMediaId, setNewMediaId] = useState("");
  const [newAlt, setNewAlt] = useState("");

  /** One place for the fetch + feedback, so no call site can forget the CSRF header. */
  async function send(
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
    success?: string,
  ): Promise<boolean> {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "X-CSRF-Token": csrfToken(),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      if (!response.ok) {
        const parsed = (await response.json().catch(() => ({}))) as { error?: string };
        setError(parsed.error ?? `That did not save (${String(response.status)}).`);
        setBusy(false);
        return false;
      }

      if (success !== undefined) setNotice(success);
      router.refresh();
      setBusy(false);
      return true;
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
      return false;
    }
  }

  async function add(): Promise<void> {
    // Alt text is required by the table CHECK and by the API. Catching it here
    // turns a 422 into a sentence beside the field that caused it.
    if (newMediaId === "" || newAlt.trim() === "") {
      setError("Choose an image and describe it before adding it.");
      return;
    }
    const ok = await send(base, "POST", { mediaId: newMediaId, alt: newAlt.trim() }, "Image added.");
    if (ok) {
      setNewMediaId("");
      setNewAlt("");
    }
  }

  async function move(index: number, by: -1 | 1): Promise<void> {
    const target = index + by;
    if (target < 0 || target >= rows.length) return;

    const ids = rows.map((r) => r.id);
    const a = ids[index];
    const b = ids[target];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[target] = a;

    await send(`${base}/reorder`, "POST", { ids }, "Order saved.");
  }

  const main = rows.find((r) => r.isDefault);

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Slider images</h2>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
        These appear as a slideshow on this service&apos;s page, in the order below. The main
        image is the one the slideshow opens on. With no images here, the page shows the single{" "}
        <strong>Image</strong> field above exactly as it does today.
      </p>

      {error !== undefined && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
          {error}
        </p>
      )}
      {notice !== undefined && (
        <p role="status" style={{ color: "var(--ok, green)", fontSize: 13 }}>
          {notice}
        </p>
      )}

      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          No slider images yet. Add one below.
        </p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0, margin: "12px 0" }}>
          {rows.map((row, index) => (
            <li
              key={row.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: 10,
                marginBottom: 8,
                background: "#fff",
              }}
            >
              {row.secureUrl !== null ? (
                // Plain <img>: an admin-only preview of an already-optimised
                // Cloudinary asset, on a screen no visitor reaches.
                <img
                  src={row.secureUrl}
                  alt={row.alt}
                  style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 4 }}
                />
              ) : (
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 4,
                    background: "#f1f0ec",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    color: "var(--muted)",
                  }}
                >
                  no preview
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, display: "block" }}>{row.alt}</span>
                {row.isDefault && (
                  <span style={{ fontSize: 12, color: "var(--accent)" }}>Main image</span>
                )}
              </div>

              <span style={{ display: "inline-flex", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => void move(index, -1)}
                  disabled={busy || index === 0}
                  aria-label={`Move ${row.alt} up`}
                  title="Move up"
                  style={smallButton}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => void move(index, 1)}
                  disabled={busy || index === rows.length - 1}
                  aria-label={`Move ${row.alt} down`}
                  title="Move down"
                  style={smallButton}
                >
                  ↓
                </button>
              </span>

              <button
                type="button"
                onClick={() =>
                  void send(`${base}/${row.id}`, "PATCH", { isDefault: true }, "Main image set.")
                }
                disabled={busy || row.isDefault}
                style={smallButton}
              >
                {row.isDefault ? "Main" : "Make main"}
              </button>

              <button
                type="button"
                onClick={() =>
                  void send(
                    `${base}/${row.id}`,
                    "DELETE",
                    undefined,
                    // Says what removal does and does not do, because "remove"
                    // reasonably reads as "delete the file".
                    "Image removed from this service. The file is still in the library.",
                  )
                }
                disabled={busy}
                style={{ ...smallButton, color: "var(--danger)" }}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}

      {rows.length > 0 && main === undefined && (
        <p style={{ fontSize: 13, color: "var(--warn)" }}>
          No main image is set, so the slideshow opens on the first one.
        </p>
      )}

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 12,
          background: "var(--surface)",
        }}
      >
        <h3 style={{ fontSize: 14, margin: "0 0 4px" }}>Add an image</h3>

        <MediaPicker
          value={newMediaId}
          onChange={(id) => setNewMediaId(id ?? "")}
          disabled={busy}
          label="Image"
        />

        <label style={{ display: "block", fontSize: 13 }}>
          Describe this image
          <input
            type="text"
            value={newAlt}
            disabled={busy}
            maxLength={300}
            onChange={(e) => setNewAlt(e.target.value)}
            placeholder="e.g. Acupressure applied to a patient's shoulder"
            style={{
              display: "block",
              width: "100%",
              marginTop: 4,
              padding: "7px 9px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Read aloud by screen readers and shown if the image fails to load. Required.
          </span>
        </label>

        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || newMediaId === "" || newAlt.trim() === ""}
          style={{ ...smallButton, marginTop: 10 }}
        >
          Add image
        </button>
      </div>
    </section>
  );
}

const smallButton: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "5px 10px",
  cursor: "pointer",
  fontSize: 13,
  whiteSpace: "nowrap",
};
