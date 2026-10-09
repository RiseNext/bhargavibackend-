/**
 * The 41 `content_blocks` rows and the 17 `content_block_items` rows — ✅ D-037.
 *
 * The slot list is **derived mechanically** from the immutable snapshot's
 * `page-content.json` by applying the exclusion rules in
 * `MASTER-PHASE-PLAN.md` Phase 10 §5, not retyped. `npm run derive:blocks` is
 * the proof: with D-037's two exclusions applied it reproduces all 12 pages and
 * all 41 rows exactly, including both pages whose keys the plan names by hand.
 *
 * Deriving rather than transcribing matters because D-003 makes this production
 * content: a typo here is a visible change on the live site, and the HTML diff
 * is the only thing that would catch it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SNAPSHOT_DIR } from "./snapshot";
import {
  EXTRA_ALLOWLIST,
  allowedExtraKeys,
  validateExtra,
} from "../../src/lib/content/extra-allowlist";
import {
  classifyCtaPair,
  isCodeOwned,
  type OwnedField,
} from "./code-owned-fields";

// ---------------------------------------------------------------------------
// Exclusion rules — Phase 10 §5 plus D-037
// ---------------------------------------------------------------------------

/** Named slots that carry no content. */
const EXCLUDED_SLOTS = new Map<string, string>([
  ["statsBand", "no copy — only a _note (Phase 10 §5)"],
  ["galleryRail", "dead code, zero importers (R-14)"],
  ["reusedSections", "annotation marker, not content"],
]);

/**
 * Slots resolved from elsewhere, so duplicating them here would create a second
 * home that silently diverges. Every entry is documented.
 */
const RESOLVED_ELSEWHERE = new Map<string, string>([
  ["breadcrumb", "route-derived, code-owned (D-026 / DB §4.1)"],
  ["breadcrumbHrefs", "route-derived, code-owned (D-026 / DB §4.1)"],
  // ✅ D-037, both verified in live source at 2fdf32a.
  [
    "mailtoSubject",
    "code-owned chrome (D-037) — an encodeURIComponent'd mailto query parameter",
  ],
  [
    "heroImageAlt",
    "derived from service.title + business_name (D-037) — a template, not authored copy",
  ],
]);

/** `notFound`'s node holds FIELDS, not nested slots. One row, not six. */
const SINGLE_SLOT_PAGES = new Map<string, string>([["notFound", "notFound"]]);

/** Slots recorded on one page but belonging to `page = 'global'` (`_usedOn` many). */
const GLOBAL_SLOTS = new Set(["ctaBand", "processSteps"]);

/** The canonical distribution. Asserted, so a snapshot change cannot drift silently. */
export const EXPECTED_DISTRIBUTION: Record<string, number> = {
  home: 8,
  global: 2,
  about: 5,
  services: 2,
  serviceDetail: 7,
  gallery: 1,
  videos: 2,
  testimonials: 1,
  blog: 2,
  careers: 4,
  contact: 6,
  notFound: 1,
};

export const EXPECTED_BLOCK_COUNT = 41;

function isAnnotationKey(key: string): boolean {
  return key.startsWith("_") || key.endsWith("Jsx");
}

// ---------------------------------------------------------------------------
// `extra` allowlist
// ---------------------------------------------------------------------------
//
// Defined in `src/lib/content/extra-allowlist.ts` and re-exported here for the
// tests that already import it from this module. The runtime owns the schema and
// the seed consumes it — the dependency ran the other way at first, which would
// have pulled seed-script code into the application bundle.

export { EXTRA_ALLOWLIST, allowedExtraKeys, validateExtra };

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export interface DerivedBlock {
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

export interface ExcludedSlot {
  page: string;
  slot: string;
  why: string;
}

type SlotNode = Record<string, unknown>;

/**
 * 🔴 The inline-emphasis convention (D-037, closing B6).
 *
 * Ten headings contain `<span className="italic">…</span>`. Plain text cannot
 * round-trip that, and losing it is a visible change on ten headings, which
 * D-010 forbids. The snapshot records the source JSX in a sibling `*Jsx` key, so
 * the emphasised span can be recovered from there and re-expressed as a single
 * `*marker*`.
 *
 * The marker is parsed back into exactly that one span and nothing else, so it
 * introduces no second markup path alongside blog blocks.
 */
export function applyEmphasisMarkers(plain: string, jsx: string | undefined): string {
  if (!jsx) return plain;

  // Only the one span form the frontend actually uses.
  const match = /<span className="italic">([^<]*)<\/span>/.exec(jsx);
  if (!match || !match[1]) return plain;

  const emphasised = match[1].trim();
  if (emphasised === "" || !plain.includes(emphasised)) return plain;

  // Replace the FIRST occurrence only; all ten headings emphasise one word or
  // phrase, and a global replace could mark an unrelated repeat.
  return plain.replace(emphasised, `*${emphasised}*`);
}

function readSnapshot(): Record<string, { slots?: SlotNode }> {
  return JSON.parse(
    readFileSync(resolve(SNAPSHOT_DIR, "data", "page-content.json"), "utf8"),
  ) as Record<string, { slots?: SlotNode }>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter((v): v is string => typeof v === "string");
  return items.length > 0 ? items : null;
}

/**
 * Pulls a `{label, href}` pair out of whichever shape the snapshot used.
 *
 * The snapshot is hand-transcribed from JSX and is not uniform: a CTA appears
 * both as `{label, href}` and as a bare label string beside a sibling `href`.
 * `siblingHref` covers the second form — `contact.infoCards` uses it.
 */
function asLink(
  value: unknown,
  siblingHref?: unknown,
): { label: string; href: string } | null {
  if (typeof value === "string") {
    const href = asString(siblingHref);
    return href ? { label: value, href } : null;
  }
  if (!value || typeof value !== "object") return null;

  const v = value as Record<string, unknown>;
  const label = asString(v.label) ?? asString(v.text) ?? asString(v.k);
  const href = asString(v.href) ?? asString(siblingHref);
  return label && href ? { label, href } : null;
}

function buildExtra(page: string, slot: string, node: SlotNode): Record<string, unknown> | null {
  const allowed = allowedExtraKeys(page, slot);
  if (allowed.length === 0) return null;

  const extra: Record<string, unknown> = {};
  for (const key of allowed) {
    if (node[key] !== undefined) extra[key] = node[key];
  }
  return Object.keys(extra).length > 0 ? extra : null;
}

export interface DerivationResult {
  blocks: DerivedBlock[];
  excluded: ExcludedSlot[];
  problems: string[];
}

export function deriveContentBlocks(): DerivationResult {
  const raw = readSnapshot();
  const blocks: DerivedBlock[] = [];
  const excluded: ExcludedSlot[] = [];
  const problems: string[] = [];

  for (const [page, node] of Object.entries(raw)) {
    if (page === "_meta" || page === "contentFileProse") continue;

    const slots = node.slots;
    if (!slots || typeof slots !== "object") continue;

    // `notFound` is one row whose fields live directly on the node.
    const single = SINGLE_SLOT_PAGES.get(page);
    if (single !== undefined) {
      blocks.push(blockFrom(page, single, slots as SlotNode));
      continue;
    }

    for (const [slot, value] of Object.entries(slots)) {
      if (isAnnotationKey(slot)) {
        excluded.push({ page, slot, why: "annotation key" });
        continue;
      }

      const namedExclusion = EXCLUDED_SLOTS.get(slot);
      if (namedExclusion !== undefined) {
        excluded.push({ page, slot, why: namedExclusion });
        continue;
      }

      const resolvedElsewhere = RESOLVED_ELSEWHERE.get(slot);
      if (resolvedElsewhere !== undefined) {
        excluded.push({ page, slot, why: resolvedElsewhere });
        continue;
      }

      // A STRING-valued slot is a standalone paragraph, not a structured block.
      // `serviceDetail.disclaimer` is the live example — real content that
      // would be silently dropped if only objects were accepted.
      if (typeof value === "string") {
        if (value.trim() === "") {
          excluded.push({ page, slot, why: "empty string" });
          continue;
        }
        const target = GLOBAL_SLOTS.has(slot) ? "global" : page;
        blocks.push(blockFrom(target, slot, { lead: value }));
        continue;
      }

      if (!value || typeof value !== "object" || Array.isArray(value)) {
        excluded.push({ page, slot, why: `not a content shape (${typeof value})` });
        continue;
      }

      const node_ = value as SlotNode;
      const contentKeys = Object.keys(node_).filter((k) => !isAnnotationKey(k));
      if (contentKeys.length === 0) {
        excluded.push({ page, slot, why: "no content keys (annotations only)" });
        continue;
      }

      const target = GLOBAL_SLOTS.has(slot) ? "global" : page;
      if (blocks.some((b) => b.page === target && b.slot === slot)) {
        // A global slot captured on two pages: keep the first, skip the repeat.
        excluded.push({ page, slot, why: "already captured under page=global" });
        continue;
      }

      blocks.push(blockFrom(target, slot, node_));
    }
  }

  // --- Assertions. A snapshot change must fail loudly, not drift. ----------

  const distribution: Record<string, number> = {};
  for (const b of blocks) distribution[b.page] = (distribution[b.page] ?? 0) + 1;

  for (const [page, expected] of Object.entries(EXPECTED_DISTRIBUTION)) {
    const got = distribution[page] ?? 0;
    if (got !== expected) {
      problems.push(`${page}: derived ${String(got)} blocks, expected ${String(expected)}`);
    }
  }
  for (const page of Object.keys(distribution)) {
    if (EXPECTED_DISTRIBUTION[page] === undefined) {
      problems.push(`${page}: unexpected page in the derivation`);
    }
  }
  if (blocks.length !== EXPECTED_BLOCK_COUNT) {
    problems.push(
      `derived ${String(blocks.length)} blocks, expected ${String(EXPECTED_BLOCK_COUNT)} (D-036/D-037)`,
    );
  }

  for (const b of blocks) {
    problems.push(...validateExtra(b.page, b.slot, b.extra));

    // 🔴 The dead-button rule, now aware of field-level ownership: a half
    // supplied by CODE counts as present, but a half that is simply MISSING
    // still fails. `classifyCtaPair` also rejects a code-owned half that was
    // nonetheless stored, which would reinstate the frozen copy.
    for (const [labelField, hrefField] of [
      ["ctaLabel", "ctaHref"],
      ["cta2Label", "cta2Href"],
    ] as const) {
      const { problem } = classifyCtaPair({
        page: b.page,
        slot: b.slot,
        labelField,
        hrefField,
        label: b[labelField],
        href: b[hrefField],
      });
      if (problem !== null) problems.push(problem);
    }
  }

  return { blocks, excluded, problems };
}

function blockFrom(page: string, slot: string, node: SlotNode): DerivedBlock {
  const cta = asLink(node.cta) ?? asLink(node.ctaPrimary) ?? asLink(node.action);
  const cta2 = asLink(node.cta2) ?? asLink(node.ctaSecondary) ?? asLink(node.secondaryCta);

  const titlePlain = asString(node.title);
  const titleJsx = asString(node.titleJsx) ?? undefined;

  /**
   * 🔴 Code-owned fields are DROPPED, not stored.
   *
   * The snapshot photographed what the page rendered; where the JSX was an
   * expression, that photograph is a frozen copy of an admin-managed value.
   * Storing it would give the admin a field whose edits do nothing while the
   * real value drifts away from it. See `code-owned-fields.ts`.
   */
  const own = <T,>(field: OwnedField, value: T): T | null =>
    isCodeOwned(page, slot, field) ? null : value;

  const extra = buildExtra(page, slot, node);
  const ownedExtra = extra === null ? null : stripCodeOwnedExtra(page, slot, extra);

  return {
    page,
    slot,
    label: own("label", asString(node.label) ?? asString(node.eyebrow)),
    // Emphasis recovered from the sibling *Jsx annotation (D-037 / B6).
    title: own("title", titlePlain === null ? null : applyEmphasisMarkers(titlePlain, titleJsx)),
    lead: own("lead", asString(node.lead) ?? asString(node.intro)),
    body: asStringArray(node.body) ?? asStringArray(node.paragraphs),
    ctaLabel: own("ctaLabel", cta?.label ?? null),
    ctaHref: own("ctaHref", cta?.href ?? null),
    cta2Label: own("cta2Label", cta2?.label ?? null),
    cta2Href: own("cta2Href", cta2?.href ?? null),
    extra: ownedExtra,
  };
}

/** Drops code-owned `extra.<key>` entries; returns null when none survive. */
function stripCodeOwnedExtra(
  page: string,
  slot: string,
  extra: Record<string, unknown>,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra)) {
    if (isCodeOwned(page, slot, `extra.${key}`)) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ---------------------------------------------------------------------------
// content_block_items — 6 groups, 17 rows (D-024 as corrected by D-041)
// ---------------------------------------------------------------------------

export interface DerivedItem {
  page: string;
  slot: string;
  groupKey: string;
  sortOrder: number;
  itemType: "text" | "label_value" | "link_row" | "image" | "card";
  label: string | null;
  value: string | null;
  text: string | null;
  href: string | null;
  iconKey: string | null;
  lines: string[] | null;
}

/**
 * The D-027 image groups are seeded by **stage S2**, because they need
 * Cloudinary media. S3 seeds the other four groups.
 *
 * ✅ Q-013 RESOLVED (D-041, owner decision 2026-10-09) — the image rows are
 * **3**, and the item total is **17**.
 *
 * An earlier pass recorded the opposite ("the image rows are 4, not 3") and
 * treated D-027's "three" as a miscount. That was wrong on both counts:
 *
 *   1. D-027 does not say "three" in passing — it **enumerates** them, by file
 *      and line: `Hero.tsx:113` acupuncture · `HomeSections.tsx:39`
 *      seed-therapy · `HomeSections.tsx:50` accupressure. The founder portrait
 *      (`Hero.tsx:73`) is **absent from that list**, and D-027's Mapping row
 *      says so outright: "`home.hero` → `images` (1 row, the wide treatment
 *      image)".
 *   2. The claim that all four snapshot entries carry "its own AUTHORED alt
 *      text" does not hold for the portrait. It carries `alt` **and**
 *      `altJsx` — and the `altJsx` is what the page actually renders:
 *
 *        "altJsx": "`${site.founder.honorific} ${site.founder.name}, ${site.founder.role}`"
 *
 *      Its `src` is `site.founder.photo`. Both halves are derived.
 *
 * D-024's §4.1.1 table did say `home.hero → images` 2, but D-024's **own**
 * "Explicitly not duplicated" row says founder name and role "are resolved from
 * their real sources … so nobody stores them twice". The table contradicts the
 * rule in the same decision, and the rule wins. D-036's total was carried from
 * that table while its prose said "**the three** D-027 image rows" — 14 + 3 =
 * 17, so 18 was the arithmetic slip.
 *
 * ⚠ Two of the non-image groups hold values that are DERIVED today:
 * `appointmentBand.rows` reads `site.phones[0]`, `site.whatsapp.href` and
 * `site.address.full`; `contact.infoCards.lines` likewise. Those rows therefore
 * store only the LABELS and the structure — `value` and `lines` stay NULL — so
 * a phone-number change still propagates from one place. The portrait row is
 * the same defect, which is why it is now excluded rather than stored.
 */
export const EXPECTED_ITEM_COUNT_S3 = 14;
export const EXPECTED_ITEM_COUNT_IMAGES = 3;
export const EXPECTED_ITEM_COUNT_TOTAL = 17;

/** One D-027 image row, with the alt text the snapshot actually authored. */
export interface DerivedImageItem {
  page: string;
  slot: string;
  groupKey: string;
  sortOrder: number;
  /** Frontend public path; stage S2 resolves it to a `media` row. */
  imagePath: string;
  /** 🔴 AUTHORED alt text, read from the snapshot. Never invented. */
  alt: string;
  /** The "role" the layout distinguishes by — portrait / wide treatment image. */
  label: string | null;
}

/**
 * ✅ D-027 — the inline home-page images.
 *
 * Read from the snapshot rather than guessed. An earlier draft of stage S2
 * invented three rows by picking plausible assets and reusing other alt text;
 * that would have shown the wrong images AND fabricated alt text, which the
 * no-hallucination rule forbids.
 *
 * 🔴 WHY ONE SNAPSHOT ENTRY IS SKIPPED — ✅ Q-013 / D-041.
 *
 * `home.hero.images` holds TWO snapshot entries. The second is the founder
 * portrait, and it is NOT content: its `src` is `site.founder.photo` and its
 * alt is built from three `site_settings` fields. Storing either freezes a copy
 * of a derived value — rename the founder's role and the portrait's alt text
 * quietly keeps the old one.
 *
 * The rule applied is the snapshot's **own marker**: an entry whose alt is an
 * EXPRESSION records it in `altJsx`, and such an entry is code-owned (D-040).
 * Keying on that rather than on a hardcoded index matters — an index would
 * silently seed the wrong row if the snapshot's order ever changed, and the
 * snapshot is immutable precisely so that order can be trusted as evidence
 * rather than as a contract.
 *
 * `Hero.tsx` renders the portrait from `site.founder.*`, so nothing is lost
 * from the page; what is removed is a second home for a value that already had
 * one.
 */
export function deriveImageItems(): { images: DerivedImageItem[]; problems: string[] } {
  const raw = readSnapshot();
  const images: DerivedImageItem[] = [];
  const problems: string[] = [];

  const GROUPS: Array<{ page: string; slot: string; expected: number }> = [
    { page: "home", slot: "hero", expected: 2 },
    { page: "home", slot: "intro", expected: 2 },
  ];

  for (const group of GROUPS) {
    const node = raw[group.page]?.slots?.[group.slot];
    const list =
      node && typeof node === "object"
        ? ((node as SlotNode).images as unknown[] | undefined)
        : undefined;

    if (!Array.isArray(list) || list.length !== group.expected) {
      problems.push(
        `${group.page}.${group.slot}.images: found ${String(
          Array.isArray(list) ? list.length : 0,
        )}, expected ${String(group.expected)}`,
      );
      continue;
    }

    list.forEach((entry, i) => {
      const e = (entry ?? {}) as Record<string, unknown>;
      const src = asString(e.src);
      const alt = asString(e.alt);

      // The snapshot records a DERIVED alt in `altJsx`. Such an entry is
      // code-owned, not content — see the note above (Q-013 / D-041).
      if (asString(e.altJsx)) return;

      if (!src || !alt) {
        problems.push(
          `${group.page}.${group.slot}.images[${String(i)}]: missing src or alt — ` +
            "neither may be invented",
        );
        return;
      }

      images.push({
        page: group.page,
        slot: group.slot,
        groupKey: "images",
        sortOrder: i + 1,
        imagePath: src,
        alt,
        label: asString(e.role),
      });
    });
  }

  if (images.length !== EXPECTED_ITEM_COUNT_IMAGES) {
    problems.push(
      `derived ${String(images.length)} image rows, expected ${String(EXPECTED_ITEM_COUNT_IMAGES)}`,
    );
  }

  return { images, problems };
}

export function deriveContentBlockItems(): { items: DerivedItem[]; problems: string[] } {
  const raw = readSnapshot();
  const items: DerivedItem[] = [];
  const problems: string[] = [];

  const slotNode = (page: string, slot: string): SlotNode | undefined => {
    const node = raw[page]?.slots?.[slot];
    return node && typeof node === "object" ? (node as SlotNode) : undefined;
  };

  // home.intro → bulletList (4 rows, plain strings)
  const intro = slotNode("home", "intro");
  const bullets = asStringArray(intro?.bulletList);
  if (bullets) {
    bullets.forEach((text, i) => {
      items.push({
        page: "home",
        slot: "intro",
        groupKey: "bulletList",
        sortOrder: i + 1,
        itemType: "text",
        label: null,
        value: null,
        text,
        href: null,
        iconKey: null,
        lines: null,
      });
    });
  }
  if ((bullets?.length ?? 0) !== 4) {
    problems.push(`home.intro.bulletList: derived ${String(bullets?.length ?? 0)} rows, expected 4`);
  }

  // home.appointmentBand → rows (3 link rows). Labels only; values derived.
  const band = slotNode("home", "appointmentBand");
  const bandRows = Array.isArray(band?.rows) ? (band.rows as unknown[]) : [];
  bandRows.forEach((row, i) => {
    const r = (row ?? {}) as Record<string, unknown>;
    items.push({
      page: "home",
      slot: "appointmentBand",
      groupKey: "rows",
      sortOrder: i + 1,
      itemType: "link_row",
      // The snapshot records these rows as `{k, v, href}` — `k` is the label
      // ("Call", "WhatsApp", "Visit").
      label: asString(r.label) ?? asString(r.k),
      // 🔴 NULL on purpose. The snapshot's `v` is a RENDERED value that comes
      // from `site.phones[0].label`, `site.whatsapp.href` and
      // `site.address.full` — storing it would create a second home for the
      // clinic's phone number, which is exactly what the sibling `vJsx`
      // annotation records.
      value: null,
      text: null,
      href: null,
      iconKey: asString(r.iconKey) ?? asString(r.icon),
      lines: null,
    });
  });
  if (bandRows.length !== 3) {
    problems.push(
      `home.appointmentBand.rows: derived ${String(bandRows.length)} rows, expected 3`,
    );
  }

  // serviceDetail.metaRow → items (3 label_value). Labels only; the values come
  // from the service record (duration, price_from_paise, typical_course).
  const metaRow = slotNode("serviceDetail", "metaRow");
  const metaItems = Array.isArray(metaRow?.items) ? (metaRow.items as unknown[]) : [];
  metaItems.forEach((item, i) => {
    const it = (item ?? {}) as Record<string, unknown>;
    items.push({
      page: "serviceDetail",
      slot: "metaRow",
      groupKey: "items",
      sortOrder: i + 1,
      itemType: "label_value",
      label: asString(it.label),
      value: null,
      text: null,
      href: null,
      iconKey: null,
      lines: null,
    });
  });
  if (metaItems.length !== 3) {
    problems.push(
      `serviceDetail.metaRow.items: derived ${String(metaItems.length)} rows, expected 3`,
    );
  }

  // contact.infoCards → items (4 cards). Structure and labels; lines derived.
  const infoCards = slotNode("contact", "infoCards");
  const cards = Array.isArray(infoCards?.items) ? (infoCards.items as unknown[]) : [];
  cards.forEach((card, i) => {
    const c = (card ?? {}) as Record<string, unknown>;
    // `cta` here is a bare label string with a sibling `href`.
    const cta = asLink(c.cta, c.href);
    items.push({
      page: "contact",
      slot: "infoCards",
      groupKey: "items",
      sortOrder: i + 1,
      itemType: "card",
      label: asString(c.label),
      // The CTA's own label, e.g. "Tap to call".
      value: cta?.label ?? null,
      text: null,
      // The hrefs are settings references (`site.phones[0].href`,
      // `site.mapsUrl`), so they stay NULL and are resolved at render time.
      href: null,
      iconKey: asString(c.iconKey) ?? asString(c.icon),
      // 🔴 NULL on purpose — `linesRendered` is derived from settings, and the
      // sibling `linesJsx` annotation records exactly which fields.
      lines: null,
    });
  });
  if (cards.length !== 4) {
    problems.push(`contact.infoCards.items: derived ${String(cards.length)} rows, expected 4`);
  }

  if (items.length !== EXPECTED_ITEM_COUNT_S3) {
    problems.push(
      `derived ${String(items.length)} S3 items, expected ${String(EXPECTED_ITEM_COUNT_S3)} ` +
        `(the other ${String(EXPECTED_ITEM_COUNT_TOTAL - EXPECTED_ITEM_COUNT_S3)} are S2's D-027 images)`,
    );
  }

  return { items, problems };
}
