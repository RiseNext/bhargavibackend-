/**
 * The blog block row shape, and the snake_case → camelCase mapping.
 *
 * 🔴 WHY THIS IS ITS OWN MODULE, with no `"use client"` directive.
 *
 * `normaliseBlockRow` lived in `BlocksEditor.tsx`, which is a Client Component,
 * and the blocks page is a Server Component that calls it:
 *
 *     <BlocksEditor postId={id} initial={rows.map(normaliseBlockRow)} />
 *
 * Invoking a function exported from a `"use client"` module on the server is
 * exactly the failure that took the service editor down in production:
 *
 *     Error: Attempted to call serviceImageOps() from the server but
 *     serviceImageOps is on the client. It's not possible to invoke a client
 *     function from the server; it can only be rendered as a Component or
 *     passed to props of a Client Component.
 *
 * This one has been latent since the admin panel was first built — the blog
 * blocks editor would have thrown the same way, naming `normaliseBlockRow`.
 *
 * ⚠ The distinction that decides where logic goes. This function is pure data
 * mapping: no DOM, no fetch, no hooks, no secrets. It is genuinely server-safe,
 * so it moves to a neutral module both sides import. The request builders in
 * `ImageCollectionEditor` are the opposite case — they describe browser fetches
 * and belong on the client, which is why that boundary was fixed by passing
 * serializable data instead of by relocating the functions.
 */

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
 * keeps the editor speaking one language.
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
