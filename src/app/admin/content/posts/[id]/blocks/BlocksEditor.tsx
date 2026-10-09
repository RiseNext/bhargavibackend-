"use client";

/**
 * The post body editor — the six block types, in order.
 *
 * 🔴 WHY THIS EXISTS. `content/[collection]/[id]/page.tsx:68` has always linked
 * to "Edit this post's content blocks →", and the route did not exist. Every
 * post therefore had an unreachable body: the blocks API was complete and had
 * no user interface, so the clinic could create a post title and excerpt and
 * nothing else. Phase 11's acceptance criterion — author an article with a
 * paragraph, an image and a video in the admin — was unmeetable.
 *
 * Calls the existing endpoints (session + CSRF + the per-type normaliser + the
 * write-time sanitiser + audit, all already enforced there) rather than a
 * Server Action, for the same reason every other admin form does.
 *
 * ⚠ `text` and `quote` accept a small HTML subset, which the SERVER sanitises
 * on write against `p,strong,em,u,a,ul,ol,li,br`. The editor says so and shows
 * what was removed, because silently dropping an editor's markup is worse than
 * refusing it.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import MediaPicker from "@/app/admin/_components/MediaPicker";

const CSRF_COOKIE = "bhw_csrf";

function csrfToken(): string {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export type BlockType = "text" | "heading" | "image" | "youtube" | "quote" | "list";

export interface BlockRow {
  id: string;
  type: BlockType;
  sortOrder: number;
  textHtml: string | null;
  headingLevel: number | null;
  headingText: string | null;
  mediaId: string | null;
  imageAlt: string | null;
  imageCaption: string | null;
  youtubeId: string | null;
  youtubeTitle: string | null;
  listItems: string[] | null;
}

/**
 * snake_case over the wire → camelCase in the component.
 *
 * The admin read returns database column names (`text_html`, `heading_level`),
 * which is the boundary convention everywhere else too. Converting in one place
 * keeps the rest of this file speaking one language.
 */
export function normaliseBlockRow(row: unknown): BlockRow {
  const r = row as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

  return {
    id: String(r.id ?? ""),
    type: String(r.type ?? "text") as BlockType,
    sortOrder: num(r.sort_order) ?? 0,
    textHtml: str(r.text_html),
    headingLevel: num(r.heading_level),
    headingText: str(r.heading_text),
    mediaId: str(r.media_id),
    imageAlt: str(r.image_alt),
    imageCaption: str(r.image_caption),
    youtubeId: str(r.youtube_id),
    youtubeTitle: str(r.youtube_title),
    listItems: Array.isArray(r.list_items) ? (r.list_items as string[]) : null,
  };
}

const TYPE_LABELS: Record<BlockType, string> = {
  heading: "Heading",
  text: "Paragraph",
  list: "Bullet list",
  quote: "Quotation",
  image: "Image",
  youtube: "Video",
};

export default function BlocksEditor({
  postId,
  initial,
}: {
  postId: string;
  initial: BlockRow[];
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<BlockRow[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [removed, setRemoved] = useState<string[]>([]);

  async function call(path: string, method: string, body?: unknown): Promise<Response> {
    return fetch(path, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  /** Re-reads from the server, so the list always matches what was stored. */
  async function refresh(): Promise<void> {
    const r = await fetch(`/api/admin/posts/${postId}/blocks`);
    if (r.ok) {
      const body = (await r.json()) as { items?: unknown[] };
      setBlocks((body.items ?? []).map(normaliseBlockRow));
    }
    router.refresh();
  }

  async function act(fn: () => Promise<Response>, what: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    setRemoved([]);
    try {
      const r = await fn();
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? `Could not ${what} (${String(r.status)}).`);
        setBusy(false);
        return;
      }
      const b = (await r.json().catch(() => ({}))) as { removed?: string[] };
      if (b.removed && b.removed.length > 0) setRemoved(b.removed);
      await refresh();
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  }

  const add = (type: BlockType): Promise<void> =>
    act(
      () =>
        call(`/api/admin/posts/${postId}/blocks`, "POST", {
          type,
          sortOrder: blocks.length,
          ...defaultsFor(type),
        }),
      "add the block",
    );

  const save = (block: BlockRow): Promise<void> =>
    act(
      () => call(`/api/admin/posts/${postId}/blocks/${block.id}`, "PATCH", payloadFor(block)),
      "save the block",
    );

  const remove = (block: BlockRow): Promise<void> => {
    if (!confirm(`Delete this ${TYPE_LABELS[block.type].toLowerCase()}?`)) return Promise.resolve();
    return act(
      () => call(`/api/admin/posts/${postId}/blocks/${block.id}`, "DELETE"),
      "delete the block",
    );
  };

  const move = (index: number, by: -1 | 1): Promise<void> => {
    const next = [...blocks];
    const target = index + by;
    if (target < 0 || target >= next.length) return Promise.resolve();
    const a = next[index];
    const b = next[target];
    if (!a || !b) return Promise.resolve();
    next[index] = b;
    next[target] = a;
    setBlocks(next);
    return act(
      () =>
        call(`/api/admin/posts/${postId}/blocks/reorder`, "POST", {
          ids: next.map((x) => x.id),
        }),
      "reorder",
    );
  };

  const patch = (id: string, change: Partial<BlockRow>): void => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...change } : b)));
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <p style={note}>
        The body of the article, in order. Each block is saved on its own, so you can work through
        a long post without losing anything.
      </p>

      {error !== undefined && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {removed.length > 0 && (
        <p style={warnBox}>
          Saved, but some formatting was removed because it is not allowed in an article:{" "}
          <strong>{removed.join(", ")}</strong>. Allowed: bold, italic, underline, links, lists and
          line breaks.
        </p>
      )}

      {blocks.length === 0 && (
        <p style={{ ...note, marginTop: 16 }}>
          This post has no content yet. Add a block below.
        </p>
      )}

      <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
        {blocks.map((block, index) => (
          <div key={block.id} style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14 }}>{TYPE_LABELS[block.type]}</strong>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>#{index + 1}</span>
              <span style={{ flex: 1 }} />
              <button type="button" disabled={busy || index === 0}
                onClick={() => void move(index, -1)} style={secondary} aria-label="Move up">
                ↑
              </button>
              <button type="button" disabled={busy || index === blocks.length - 1}
                onClick={() => void move(index, 1)} style={secondary} aria-label="Move down">
                ↓
              </button>
              <button type="button" disabled={busy} onClick={() => void save(block)} style={primary}>
                Save
              </button>
              <button type="button" disabled={busy} onClick={() => void remove(block)}
                style={{ ...secondary, color: "var(--danger)", borderColor: "var(--danger)" }}>
                Delete
              </button>
            </div>

            <BlockFields block={block} disabled={busy} onChange={(c) => patch(block.id, c)} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>Add a block</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(Object.keys(TYPE_LABELS) as BlockType[]).map((t) => (
            <button key={t} type="button" disabled={busy} onClick={() => void add(t)} style={secondary}>
              + {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A new block starts with valid content, so it is never saved empty. */
function defaultsFor(type: BlockType): Record<string, unknown> {
  switch (type) {
    case "heading":
      return { headingLevel: 2, headingText: "New heading" };
    case "text":
      return { textHtml: "<p>New paragraph.</p>" };
    case "quote":
      return { textHtml: "<p>New quotation.</p>" };
    case "list":
      return { listItems: ["First point"] };
    case "youtube":
      // The API requires a real 11-character id, so a placeholder would be
      // rejected; the editor pastes one and saves.
      return { youtubeId: "aaaaaaaaaaa" };
    case "image":
      return {};
  }
}

/** Only the fields belonging to this block's type — the API is strict. */
function payloadFor(b: BlockRow): Record<string, unknown> {
  const base: Record<string, unknown> = { type: b.type, sortOrder: b.sortOrder };
  switch (b.type) {
    case "heading":
      return { ...base, headingLevel: b.headingLevel ?? 2, headingText: b.headingText ?? "" };
    case "text":
    case "quote":
      return { ...base, textHtml: b.textHtml ?? "" };
    case "list":
      return { ...base, listItems: (b.listItems ?? []).filter((i) => i.trim() !== "") };
    case "youtube":
      return {
        ...base,
        youtubeId: b.youtubeId ?? "",
        ...(b.youtubeTitle === null || b.youtubeTitle === "" ? {} : { youtubeTitle: b.youtubeTitle }),
      };
    case "image":
      return {
        ...base,
        ...(b.mediaId === null ? {} : { mediaId: b.mediaId }),
        ...(b.imageAlt === null || b.imageAlt === "" ? {} : { imageAlt: b.imageAlt }),
        ...(b.imageCaption === null || b.imageCaption === "" ? {} : { imageCaption: b.imageCaption }),
      };
  }
}

function BlockFields({
  block,
  disabled,
  onChange,
}: {
  block: BlockRow;
  disabled: boolean;
  onChange: (change: Partial<BlockRow>) => void;
}) {
  if (block.type === "heading") {
    return (
      <>
        <label style={field}>
          <span style={labelStyle}>Heading text</span>
          <input type="text" value={block.headingText ?? ""} disabled={disabled}
            maxLength={300} onChange={(e) => onChange({ headingText: e.target.value })}
            style={control} />
        </label>
        <label style={field}>
          <span style={labelStyle}>Level</span>
          <select value={String(block.headingLevel ?? 2)} disabled={disabled}
            onChange={(e) => onChange({ headingLevel: Number(e.target.value) })} style={control}>
            <option value="2">Main heading</option>
            <option value="3">Sub-heading</option>
          </select>
          <Help>The article title is the top heading, so these start one level below it.</Help>
        </label>
      </>
    );
  }

  if (block.type === "text" || block.type === "quote") {
    return (
      <label style={field}>
        <span style={labelStyle}>{block.type === "quote" ? "Quotation" : "Paragraph"}</span>
        <textarea value={block.textHtml ?? ""} rows={5} disabled={disabled}
          onChange={(e) => onChange({ textHtml: e.target.value })}
          style={{ ...control, resize: "vertical", fontFamily: "inherit" }} />
        <Help>
          Plain text is fine. Allowed formatting: &lt;strong&gt;, &lt;em&gt;, &lt;u&gt;,
          &lt;a href&gt;, &lt;ul&gt;/&lt;ol&gt;/&lt;li&gt;, &lt;br&gt; and &lt;p&gt;. Anything
          else is removed when you save, and you will be told what was.
        </Help>
      </label>
    );
  }

  if (block.type === "list") {
    const items = block.listItems ?? [];
    return (
      <div style={field}>
        <span style={labelStyle}>Points</span>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input type="text" value={item} disabled={disabled} maxLength={2000}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange({ listItems: next });
              }}
              style={control} />
            <button type="button" disabled={disabled} aria-label={`Remove point ${String(i + 1)}`}
              onClick={() => onChange({ listItems: items.filter((_, j) => j !== i) })}
              style={{ ...secondary, color: "var(--danger)" }}>
              ×
            </button>
          </div>
        ))}
        <button type="button" disabled={disabled || items.length >= 60}
          onClick={() => onChange({ listItems: [...items, ""] })} style={secondary}>
          Add point
        </button>
      </div>
    );
  }

  if (block.type === "image") {
    return (
      <>
        <MediaPicker label="Image" value={block.mediaId ?? ""} disabled={disabled}
          onChange={(id) => onChange({ mediaId: id })} />
        <label style={field}>
          <span style={labelStyle}>Alt text</span>
          <input type="text" value={block.imageAlt ?? ""} disabled={disabled} maxLength={300}
            onChange={(e) => onChange({ imageAlt: e.target.value })} style={control} />
          <Help>What the image shows, for someone who cannot see it.</Help>
        </label>
        <label style={field}>
          <span style={labelStyle}>Caption</span>
          <input type="text" value={block.imageCaption ?? ""} disabled={disabled} maxLength={300}
            onChange={(e) => onChange({ imageCaption: e.target.value })} style={control} />
          <Help>Optional. Leave empty for no caption.</Help>
        </label>
      </>
    );
  }

  return (
    <>
      <label style={field}>
        <span style={labelStyle}>YouTube id</span>
        <input type="text" value={block.youtubeId ?? ""} disabled={disabled}
          onChange={(e) => onChange({ youtubeId: e.target.value })} style={control} />
        <Help>
          The 11 characters after <code>v=</code> in the video address — not the whole link.
        </Help>
      </label>
      <label style={field}>
        <span style={labelStyle}>Video title</span>
        <input type="text" value={block.youtubeTitle ?? ""} disabled={disabled} maxLength={300}
          onChange={(e) => onChange({ youtubeTitle: e.target.value })} style={control} />
      </label>
    </>
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
      {children}
    </span>
  );
}

const field: React.CSSProperties = { display: "block", margin: "12px 0" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, marginBottom: 4 };
const note: React.CSSProperties = { fontSize: 13, color: "var(--muted)" };

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
  padding: "7px 14px",
  cursor: "pointer",
  fontSize: 13,
};

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
  padding: 14,
};

const warnBox: React.CSSProperties = {
  background: "#fff8e6",
  border: "1px solid var(--warn)",
  borderRadius: "var(--radius)",
  padding: 12,
  fontSize: 13,
};
