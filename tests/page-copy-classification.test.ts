/**
 * 🔴 PUB-02 — which captured page-copy fields are CODE-OWNED, not copy.
 *
 * The page-copy half of PUB-02 cannot be wired until this is settled, because
 * wiring a code-owned field as a literal string is a REGRESSION, not a feature:
 * it freezes a value the admin is supposed to control.
 *
 * The content snapshot records, for every slot, both the rendered TEXT and a
 * `<field>Jsx` annotation describing the original JSX. Where that annotation
 * contains a `{…}` expression or a template literal, the live site DERIVES the
 * value at render time — from `site.phones[0]`, `site.founder`, `site.hours`,
 * `site.email`, `testimonials.length` or the current `service`. The snapshot's
 * plain-text capture is a point-in-time PHOTOGRAPH of that derivation.
 *
 * Two worked examples of why this matters:
 *
 *   · `global.ctaBand.cta2_label` is stored as "Call +91 70751 57013" while
 *     `HomeSections.tsx:525` renders `Call {site.phones[0].label}`. Consume the
 *     stored value and changing the phone number in the admin updates the
 *     footer and the floating call button but NOT the call-to-action band — the
 *     site then contradicts itself. That is precisely the opening-hours
 *     duplication class of defect this project already had to fix once.
 *
 *   · `careers.apply.extra.resumeInstruction` is stored with the email address
 *     inlined, while `careers/page.tsx` renders `<a href={mailtoHref}>` — so
 *     consuming it would both freeze the address AND destroy the link.
 *
 * This suite derives the list mechanically from the snapshot rather than
 * hard-coding it, so a snapshot change cannot silently add an unclassified
 * field. D-037 already set this precedent at SLOT level (`mailtoSubject`,
 * `heroImageAlt` live in `RESOLVED_ELSEWHERE`); this is the same rule applied at
 * FIELD level.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED_BLOCK_COUNT, deriveContentBlocks } from "../scripts/seed/content-blocks";

const SNAPSHOT = resolve(
  import.meta.dirname,
  "..",
  "docs",
  "CURRENT-FRONTEND-CONTENT",
  "data",
  "page-content.json",
);

interface Node {
  [key: string]: unknown;
}

/** A field whose original JSX derives its value at render time. */
interface CodeOwnedField {
  key: string;
  jsx: string;
}

function readSnapshot(): Node {
  return JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Node;
}

/**
 * Every field whose `<field>Jsx` annotation shows a runtime expression.
 *
 * `{identifier}` covers JSX interpolation; `${` covers a template literal.
 * A bare `<span className="italic">` is NOT an expression — that round-trips
 * through the `*marker*` convention (D-037) and stays editable.
 */
export function codeOwnedExpressionFields(): CodeOwnedField[] {
  const snapshot = readSnapshot();
  const found = new Map<string, string>();

  const walk = (page: string, slot: string, node: Node, path: string): void => {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("_")) continue;

      if (key.endsWith("Jsx")) {
        const field = key.slice(0, -3);
        const jsx = String(value);
        if (/\{[a-zA-Z]/.test(jsx) || jsx.includes("${")) {
          found.set(`${page}.${slot}${path === "" ? "" : `.${path}`}.${field}`, jsx);
        }
        continue;
      }

      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        walk(page, slot, value as Node, path === "" ? key : `${path}.${key}`);
      }
    }
  };

  for (const [page, pageValue] of Object.entries(snapshot)) {
    if (page.startsWith("_")) continue;
    const slots = (pageValue as Node).slots;
    if (slots === undefined || slots === null || typeof slots !== "object") continue;
    for (const [slot, slotValue] of Object.entries(slots as Node)) {
      if (slotValue !== null && typeof slotValue === "object") {
        walk(page, slot, slotValue as Node, "");
      }
    }
  }

  return [...found.entries()]
    .map(([key, jsx]) => ({ key, jsx }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

describe("PUB-02 · code-owned page-copy fields are enumerated and traceable", () => {
  it("🔴 finds exactly TWENTY-ONE derived fields, not two", () => {
    // The figure the page-copy plan was written against was 2. Wiring on that
    // premise would have frozen nineteen further admin-managed values.
    expect(codeOwnedExpressionFields()).toHaveLength(21);
  });

  it("the list is exactly this, and a snapshot change cannot add one silently", () => {
    expect(codeOwnedExpressionFields().map((f) => f.key)).toEqual([
      "about.hero.lead",
      "about.hero.title",
      "about.story.cta.label",
      "about.story.portrait.alt",
      "careers.apply.hours",
      "careers.apply.resumeInstruction",
      "careers.generalApplication.ctaSecondary.label",
      "contact.hero.asideCtaPrimary.label",
      "contact.map.iframeTitle",
      "home.ctaBand.ctaSecondary.label",
      "home.healthTalks.lead",
      "home.hero.eyebrow",
      "home.hero.marqueeScreenReaderText",
      "home.hero.portraitCaption.name",
      "home.hero.portraitCaption.role",
      "home.hero.supportingCopy",
      "home.testimonials.action.label",
      "serviceDetail.bookingAside.title",
      "serviceDetail.callAside.whatsappCta.href",
      "testimonials.hero.lead",
      "videos.hero.lead",
    ]);
  });

  it("🔴 the two fields already ruled code-owned are in it", () => {
    const keys = codeOwnedExpressionFields().map((f) => f.key);
    // `global.ctaBand.cta2.href` is the literal string "site.phones[0].href",
    // captured under the `home` page before GLOBAL_SLOTS lifts it out.
    expect(keys).toContain("home.ctaBand.ctaSecondary.label");
    expect(keys).toContain("serviceDetail.bookingAside.title");
  });

  it("🔴 the stored values really are FROZEN derivations, not copy", () => {
    const byKey = new Map(codeOwnedExpressionFields().map((f) => [f.key, f.jsx]));

    // Each of these reads a value an administrator controls elsewhere.
    expect(byKey.get("home.ctaBand.ctaSecondary.label")).toContain("site.phones[0]");
    expect(byKey.get("contact.hero.asideCtaPrimary.label")).toContain("site.phones[0]");
    expect(byKey.get("careers.apply.hours")).toContain("site.hours[0]");
    expect(byKey.get("careers.generalApplication.ctaSecondary.label")).toContain("site.email");
    expect(byKey.get("home.hero.portraitCaption.name")).toContain("site.founder");
    expect(byKey.get("home.testimonials.action.label")).toContain("testimonials.length");
    expect(byKey.get("serviceDetail.bookingAside.title")).toContain("service.title");
  });

  it("🔴 `site.phones[0].href` appears FOUR times, not once", () => {
    // The page-copy plan named one occurrence. Two more are CTAs in
    // `content_blocks`, and two are rows in `content_block_ITEMS` — a second
    // table the field analysis did not originally cover.
    const snapshot = readSnapshot();
    const hrefs: string[] = [];
    const scan = (node: unknown, path: string): void => {
      if (node === null || typeof node !== "object") return;
      for (const [k, v] of Object.entries(node as Node)) {
        if (k === "href" && v === "site.phones[0].href") hrefs.push(path);
        scan(v, `${path}.${k}`);
      }
    };
    scan(snapshot, "");
    // FOUR, in two different tables:
    //   home.ctaBand.ctaSecondary.href       (content_blocks — the one ruled on)
    //   contact.hero.asideCtaPrimary.href    (content_blocks — a second CTA)
    //   home.appointmentBand.rows[0].href    (content_block_ITEMS)
    //   contact.infoCards.items[0].href      (content_block_ITEMS)
    expect(hrefs).toHaveLength(4);
  });

  it("excluding them does NOT change the canonical 41-slot count (D-036/D-037)", () => {
    // Every affected slot keeps at least one editable field, so this is a
    // FIELD-level exclusion and no row disappears.
    const { blocks, problems } = deriveContentBlocks();
    expect(problems).toEqual([]);
    expect(blocks).toHaveLength(EXPECTED_BLOCK_COUNT);
    expect(EXPECTED_BLOCK_COUNT).toBe(41);
  });

  it("affects 14 of the 41 slots", () => {
    const slots = new Set(
      codeOwnedExpressionFields().map((f) => f.key.split(".").slice(0, 2).join(".")),
    );
    expect(slots.size).toBe(14);
  });

  /**
   * 🔴 THE UNRESOLVED CONFLICT, pinned so it cannot be forgotten.
   *
   * `content-blocks.ts` asserts that a CTA's label and href are "both present
   * or both absent". Two CTAs have ONE code-owned half and one genuinely
   * editable half, so a field-level exclusion leaves them half-populated and
   * trips that gate:
   *
   *   · `serviceDetail.callAside.whatsappCta` — label "Ask on WhatsApp" is real
   *     copy; href is `whatsappUrl(\`Enquiry about ${service.title}\`)`.
   *   · `about.story.cta` — label is `Consult with {…founder.name…}`; href is
   *     the literal `/contact`.
   *
   * Resolving this means either excluding the whole CTA (losing an editable
   * label) or teaching that gate about code-owned halves (changing an approved
   * verification gate). Both are decisions, not implementation details.
   */
  it("🔴 records the TWO CTAs with one code-owned half and one editable half", () => {
    const keys = codeOwnedExpressionFields().map((f) => f.key);
    expect(keys).toContain("serviceDetail.callAside.whatsappCta.href");
    expect(keys).toContain("about.story.cta.label");

    const snapshot = readSnapshot();
    const slots = (snapshot.serviceDetail as Node).slots as Node;
    const whatsapp = (slots.callAside as Node).whatsappCta as Node;
    // The label is ordinary copy — excluding it would remove editable content.
    expect(whatsapp.label).toBe("Ask on WhatsApp");
    expect(whatsapp.labelJsx).toBeUndefined();

    const aboutSlots = (snapshot.about as Node).slots as Node;
    const storyCta = (aboutSlots.story as Node).cta as Node;
    // The href is an ordinary route — excluding it would remove editable content.
    expect(storyCta.href).toBe("/contact");
    expect(storyCta.hrefJsx).toBeUndefined();
  });
});
