/**
 * ✅ D-037 — the inline-emphasis parser. Closes gate 0.12's third component (B6).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ DESTINATION: `frontend/src/lib/emphasis.tsx` in `bhargavi-fronted`.     │
 * │ It lives here because modifying the frontend needs authorisation that   │
 * │ has not been given. It is dependency-free so adopting it is a copy.     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * THE PROBLEM. Ten headings in the live site contain inline emphasis, e.g.
 * `Healing that treats the <span className="italic">whole</span> person`
 * (`HomeSections.tsx:75-77`). Those headings are becoming editable page copy,
 * and plain text cannot round-trip a span.
 *
 * The three options, and why this is the one:
 *   (a) accept losing the italics — **rejected**: a visible change on ten
 *       headings, which D-010 forbids;
 *   (c) keep those ten titles in code — **rejected**: leaves ten strings
 *       uneditable, contradicting the content-management rule;
 *   (b) a limited `*marker*` convention — **adopted**: the smallest rule that
 *       preserves the design.
 *
 * 🔴 SECURITY. This must not become a second markup path alongside blog blocks.
 * It therefore emits EXACTLY ONE element type — `<span className="italic">` —
 * and never interprets anything else. There is no `dangerouslySetInnerHTML`
 * anywhere in it: it returns React elements, so every non-marker character is
 * escaped by React itself. A `<script>` in a heading renders as literal text.
 */

import type { ReactNode } from "react";

/** `*word*` or `*several words*`. Non-greedy, and never spans a newline. */
const MARKER = /\*([^*\n]+)\*/g;

/**
 * Parses `*emphasis*` into `<span className="italic">`.
 *
 * Returns a ReactNode array suitable for rendering directly inside a heading.
 * Unmatched asterisks are left as literal text — a stray `*` in copy should
 * render, not silently swallow the rest of the line.
 *
 * @example
 *   emphasise("Healing that treats the *whole* person")
 *   // → ["Healing that treats the ", <span className="italic">whole</span>, " person"]
 */
export function emphasise(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // `matchAll` rather than a stateful `exec` loop, so a shared regex cannot
  // leak `lastIndex` between calls.
  for (const match of text.matchAll(MARKER)) {
    const index = match.index;
    if (index === undefined) continue;

    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));

    nodes.push(
      // The ONLY element this function can produce.
      <span key={`em-${String(key)}`} className="italic">
        {match[1]}
      </span>,
    );
    key += 1;
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  // A heading with no markers returns a single string, which React renders
  // identically to the original literal.
  return nodes;
}

/** True when `text` carries at least one marker. Useful in tests and the admin. */
export function hasEmphasis(text: string): boolean {
  return MARKER.test(text.replace(MARKER, (m) => m));
}

/**
 * Strips markers, yielding the plain reading.
 *
 * Needed wherever a heading is used as TEXT rather than markup: `<title>`,
 * meta descriptions, `aria-label`, and JSON-LD — where an asterisk would be a
 * visible defect.
 */
export function stripEmphasis(text: string): string {
  return text.replace(MARKER, "$1");
}

/**
 * Round-trip check, used by the test that pins all ten headings.
 *
 * Reconstructs the original JSX-equivalent markup from a marked string, so the
 * ten live headings can be proved byte-identical to what they render today.
 */
export function toMarkup(text: string): string {
  return text.replace(MARKER, '<span className="italic">$1</span>');
}
