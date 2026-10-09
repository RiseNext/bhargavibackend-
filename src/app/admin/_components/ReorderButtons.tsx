"use client";

/**
 * Move up / move down, for one row of a collection list.
 *
 * 🔴 WHY THIS EXISTS. Nine collections declared `canReorder: true` and nine
 * `POST /api/admin/{collection}/reorder` endpoints were implemented and tested —
 * and no screen ever rendered a control that called them. `sort_order` decides
 * the order services, testimonials, videos, gallery tiles, FAQs, jobs, stats,
 * social icons and page lists appear in on the public site, so the owner could
 * not change any of it without a developer. That is the one thing this project
 * exists to make possible. Only the blog-block editor had the controls.
 *
 * Buttons rather than drag-and-drop, deliberately: this matches the in-house
 * pattern in `BlocksEditor.tsx`, works with a keyboard and a screen reader
 * without a drag-and-drop accessibility story, and survives a long list on a
 * phone. The arrows carry `aria-label`s because a glyph is not a name.
 *
 * `ids` is the row's PEER GROUP in display order, not necessarily the whole
 * table — `content_list_items` is ordered `collection, sort_order`, so a row may
 * only move among its own list. The endpoint numbers whatever ids it is given
 * from 1, which is exactly right for a group.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

const CSRF_COOKIE = "bhw_csrf";

/** The double-submit token. Readable by design — that is the mechanism. */
function csrfToken(): string {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export default function ReorderButtons({
  slug,
  ids,
  index,
}: {
  slug: string;
  ids: string[];
  index: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const first = index === 0;
  const last = index === ids.length - 1;

  async function move(by: -1 | 1): Promise<void> {
    const target = index + by;
    if (target < 0 || target >= ids.length) return;

    const next = [...ids];
    const a = next[index];
    const b = next[target];
    if (a === undefined || b === undefined) return;
    next[index] = b;
    next[target] = a;

    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/${slug}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
        body: JSON.stringify({ ids: next }),
      });

      if (!response.ok) {
        // 🔴 Never move the row on screen when the write failed — the list is
        // re-read from the database, so a silent failure would show an order
        // that does not exist.
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Could not reorder (${String(response.status)}).`);
        setBusy(false);
        return;
      }

      // The server component owns the order; re-render it rather than guessing.
      router.refresh();
      setBusy(false);
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
      <button
        type="button"
        onClick={() => void move(-1)}
        disabled={busy || first}
        aria-label="Move up"
        title="Move up"
        style={button}
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() => void move(1)}
        disabled={busy || last}
        aria-label="Move down"
        title="Move down"
        style={button}
      >
        ↓
      </button>
      {error !== undefined && (
        <span role="alert" style={{ color: "var(--danger)", fontSize: 12 }}>
          {error}
        </span>
      )}
    </span>
  );
}

const button: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "2px 7px",
  cursor: "pointer",
  lineHeight: 1.4,
};
