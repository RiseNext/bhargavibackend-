/**
 * Field-level content ownership — the PUB-02 classification.
 *
 * `RESOLVED_ELSEWHERE` in `derive-content-blocks.mts` excludes whole SLOTS that
 * are code-owned (D-037: `mailtoSubject`, `heroImageAlt`). This is the same rule
 * at FIELD level, for slots that are mostly real copy but carry one or two
 * values the live site DERIVES at render time.
 *
 * 🔴 WHY EXCLUSION IS THE RIGHT ANSWER, not consumption.
 *
 * The content snapshot photographs what the page rendered on the day it was
 * taken. Where the JSX was an expression, that photograph is a FROZEN COPY of a
 * value an administrator controls somewhere else:
 *
 *   global.ctaBand.cta2Label  "Call +91 70751 57013"
 *   HomeSections.tsx:525      Call {site.phones[0].label}
 *
 * Consume the stored string and the call-to-action band stops tracking the
 * phone number: edit it in the admin and the footer and the floating call
 * button move while the band does not. The site then contradicts itself. This
 * project already had to fix exactly that defect once, for the opening hours —
 * `src/lib/hours.ts` exists because the hours had been written out by hand in
 * four places.
 *
 * Keeping these fields OUT of `content_blocks` means:
 *   · the admin never shows a field whose edits would do nothing;
 *   · the value keeps flowing from the one place that owns it;
 *   · the page component keeps rendering the expression it renders today, so
 *     nothing visible changes.
 *
 * ⚠ ONLY TWELVE ENTRIES. The snapshot contains 21 derived fields in
 * `content_blocks` shape and 10 more inside `content_block_items`, but the
 * derivation already drops the rest — `about.hero.title`,
 * `contact.hero.asideCtaPrimary.label`, `careers.apply.hours`,
 * `serviceDetail.callAside.whatsappCta.href` and the others never reach a row,
 * because `asLink()` refuses a half-formed pair and the remaining fields are
 * not part of the block shape. `tests/page-copy-classification.test.ts` proves
 * which ones land and which do not; this map covers exactly the ones that land.
 */

/** A derived field name on a `content_blocks` row, or `extra.<key>`. */
export type OwnedField =
  | "label"
  | "title"
  | "lead"
  | "ctaLabel"
  | "ctaHref"
  | "cta2Label"
  | "cta2Href"
  | `extra.${string}`;

export interface CodeOwnedField {
  /** The expression the live page renders instead. */
  jsx: string;
  /** Where that expression lives, so the claim is checkable. */
  source: string;
  /** Which admin-managed value it derives from. */
  derivesFrom: string;
}

/**
 * Keyed `"<page>.<slot>"` — the DERIVED page, so `ctaBand` appears as
 * `global.ctaBand` (GLOBAL_SLOTS lifts it out of `home`).
 */
export const CODE_OWNED_FIELDS = new Map<string, Partial<Record<OwnedField, CodeOwnedField>>>([
  [
    "global.ctaBand",
    {
      cta2Label: {
        jsx: "Call {site.phones[0].label}",
        source: "components/sections/HomeSections.tsx:525",
        derivesFrom: "branches.phone_label, ordered by phone_sort_order (D-013)",
      },
      cta2Href: {
        // Captured as the literal string "site.phones[0].href" — the snapshot
        // transcriber recorded the expression itself, not a value.
        jsx: "site.phones[0].href",
        source: "components/sections/HomeSections.tsx:521",
        derivesFrom: "branches.phone_e164, ordered by phone_sort_order (D-013)",
      },
    },
  ],
  [
    "home.hero",
    {
      title: {
        // 🔴 NOT one string with an italic word. The live h1 is THREE animated
        // <Wipe> lines — `Wellness` / `Center made` / `for <span
        // className="italic text-terracotta">you</span>` — and the emphasis
        // class carries a COLOUR the `*marker*` convention cannot express
        // (`emphasise()` emits `italic` only, by design). A flat string cannot
        // reproduce either the line split or the terracotta.
        jsx: 'Three <Wipe> lines; `for ` + <span className="italic text-terracotta">you</span>',
        source: "components/sections/Hero.tsx:42-52",
        derivesFrom: "code-owned layout: animated line split + a colour-bearing emphasis class",
      },
      label: {
        jsx: "{site.name} · Chikkadpally, Hyderabad",
        source: "components/sections/Hero.tsx:36-63",
        derivesFrom: "site_settings.business_name",
      },
      "extra.supportingCopy": {
        jsx: "… led by <span className=\"italic\">{founder}</span> …",
        source: "components/sections/Hero.tsx",
        derivesFrom: "site_settings.founder_honorific + founder_name",
      },
    },
  ],
  [
    "home.healthTalks",
    {
      lead: {
        jsx: "`${site.founder.honorific} ${site.founder.name} on pressure points, diet …`",
        source: "components/sections/HomeSections.tsx",
        derivesFrom: "site_settings.founder_honorific + founder_name",
      },
    },
  ],
  [
    "home.testimonials",
    {
      // 🔴 A SPLIT CTA: this label is derived, its href "/testimonials" is real
      // editable copy. The pairing gate understands this (see validateCtaPair).
      ctaLabel: {
        jsx: "All {testimonials.length} reviews",
        source: "components/sections/HomeSections.tsx:313",
        derivesFrom: "a live count of published testimonials",
      },
    },
  ],
  [
    "about.hero",
    {
      title: {
        // 🔴 The honorific is an EXPRESSION. Stored as "Mrs. *Anjana* Bhargavi",
        // which FREEZES `site.founder.honorific` — an admin-managed field.
        // Found only on a second pass: the first land-check compared the plain
        // snapshot text against a stored value that had already gained its
        // `*emphasis*` markers, so it read as a miss.
        jsx: '{site.founder.honorific} <span className="italic">Anjana</span> Bhargavi',
        source: "app/about/page.tsx:54-58",
        derivesFrom: "site_settings.founder_honorific",
      },
      lead: {
        jsx: "{site.founder.role}",
        source: "app/about/page.tsx",
        derivesFrom: "site_settings.founder_role",
      },
    },
  ],
  [
    "about.story",
    {
      // 🔴 The second SPLIT CTA: derived label, editable "/contact" href.
      ctaLabel: {
        jsx: 'Consult with {site.founder.name.split(" ")[0]}',
        source: "app/about/page.tsx",
        derivesFrom: "site_settings.founder_name (first word)",
      },
    },
  ],
  [
    "testimonials.hero",
    {
      lead: {
        jsx: "`${testimonials.length} reviews from people treated for pain, thyroid …`",
        source: "app/testimonials/page.tsx",
        derivesFrom: "a live count of published testimonials",
      },
    },
  ],
  [
    "videos.hero",
    {
      lead: {
        jsx: "`${site.founder.honorific} ${site.founder.name} on pressure points …`",
        source: "app/videos/page.tsx",
        derivesFrom: "site_settings.founder_honorific + founder_name",
      },
    },
  ],
  [
    "careers.generalApplication",
    {
      cta2Label: {
        jsx: "Email your resume to {site.email}",
        source: "app/careers/page.tsx",
        derivesFrom: "site_settings.public_email",
      },
      cta2Href: {
        // Not an expression in the snapshot, but the address is baked into the
        // URL, so it is a frozen derivation of the same value. `mailtoSubject`
        // is already code-owned chrome under D-037 for the same reason.
        jsx: "`mailto:${site.email}?subject=…` (D-037 mailtoSubject)",
        source: "app/careers/page.tsx:15-17",
        derivesFrom: "site_settings.public_email",
      },
    },
  ],
  [
    "careers.openings",
    {
      "extra.asideTitle": {
        // Stored WITHOUT a marker ("Grow with Bhargavi Health World") while the
        // live JSX italicises one word. Consuming it as-is would silently drop
        // the italic, so it stays code-owned — the `*marker*` convention could
        // represent it, but only by editing the immutable snapshot's captured
        // value, which is not permitted.
        jsx: 'Grow with <span className="italic">Bhargavi</span> Health World',
        source: "app/careers/page.tsx:38-40",
        derivesFrom: "code-owned styling: italic emphasis absent from the captured value",
      },
    },
  ],
  [
    "careers.apply",
    {
      "extra.resumeInstruction": {
        jsx: 'Email your resume to <a href={mailtoHref}>{site.email}</a> with the role …',
        source: "app/careers/page.tsx",
        derivesFrom: "site_settings.public_email — and it is a LINK, not text",
      },
    },
  ],
  [
    "serviceDetail.bookingAside",
    {
      title: {
        jsx: "Book {service.title}",
        source: "app/services/[slug]/page.tsx",
        derivesFrom: "the current service's title — different on all ten pages",
      },
    },
  ],
]);

/**
 * Total FIELD entries, asserted by the test so the map cannot drift.
 *
 * 🔵 17. Twelve snapshot-derived fields land in a row; two of them are
 * CTA labels whose paired href is a frozen derivation of the same value
 * (`global.ctaBand.cta2Href` is the literal "site.phones[0].href";
 * `careers.generalApplication.cta2Href` has the email baked into the mailto).
 * Those two pairs are therefore owned as pairs (14), and three more were found
 * on a second pass: `about.hero.title` (a frozen honorific that the first
 * land-check missed because stored titles carry `*emphasis*` markers),
 * `home.hero.title` (three animated lines plus a colour-bearing emphasis class)
 * and `careers.openings.extra.asideTitle` (italic absent from the captured
 * value). 17 in total.
 */
export const CODE_OWNED_FIELD_COUNT = 17;

/** True when this derived field is code-owned and must not be stored. */
export function isCodeOwned(page: string, slot: string, field: OwnedField): boolean {
  return CODE_OWNED_FIELDS.get(`${page}.${slot}`)?.[field] !== undefined;
}

export function codeOwnedFor(page: string, slot: string): Partial<Record<OwnedField, CodeOwnedField>> {
  return CODE_OWNED_FIELDS.get(`${page}.${slot}`) ?? {};
}

/** Flat list of `page.slot.field` keys, for tests and documentation. */
export function codeOwnedFieldKeys(): string[] {
  const out: string[] = [];
  for (const [key, fields] of CODE_OWNED_FIELDS) {
    for (const field of Object.keys(fields)) out.push(`${key}.${field}`);
  }
  return out.sort();
}

/**
 * 🔴 The CTA gate, now aware of field-level ownership.
 *
 * The original rule was "label and href must both be present or both absent" —
 * a label with no destination renders a dead button, and a destination with no
 * label renders nothing. That rule is still enforced; what changes is that a
 * half supplied by CODE counts as present.
 *
 * Four outcomes:
 *   · both stored            → valid, fully editable
 *   · both code-owned        → valid, nothing stored (global.ctaBand)
 *   · one stored, one owned  → valid, MIXED (about.story, home.testimonials)
 *   · one stored, one absent
 *     and NOT code-owned     → INVALID, which is the dead-button case
 */
export type CtaOwnership = "absent" | "editable" | "code-owned" | "mixed";

export function classifyCtaPair(input: {
  page: string;
  slot: string;
  labelField: "ctaLabel" | "cta2Label";
  hrefField: "ctaHref" | "cta2Href";
  label: string | null;
  href: string | null;
}): { ownership: CtaOwnership; problem: string | null } {
  const { page, slot, labelField, hrefField, label, href } = input;

  const labelOwned = isCodeOwned(page, slot, labelField);
  const hrefOwned = isCodeOwned(page, slot, hrefField);

  // A code-owned half must NOT be stored — otherwise the frozen copy is back.
  if (labelOwned && label !== null) {
    return {
      ownership: "mixed",
      problem: `${page}.${slot}: ${labelField} is code-owned and must not be stored (found ${JSON.stringify(label)})`,
    };
  }
  if (hrefOwned && href !== null) {
    return {
      ownership: "mixed",
      problem: `${page}.${slot}: ${hrefField} is code-owned and must not be stored (found ${JSON.stringify(href)})`,
    };
  }

  const effectiveLabel = labelOwned || label !== null;
  const effectiveHref = hrefOwned || href !== null;

  // Neither half exists at all — simply no CTA on this slot.
  if (!effectiveLabel && !effectiveHref) return { ownership: "absent", problem: null };

  // 🔴 The dead-button rule, preserved exactly.
  if (effectiveLabel !== effectiveHref) {
    const missing = effectiveLabel ? "destination" : "label";
    return {
      ownership: "mixed",
      problem:
        `${page}.${slot}: CTA has no effective ${missing}. A label without a destination ` +
        "renders a dead button; a destination without a label renders nothing. Either supply " +
        "both, or classify the missing half as code-owned with evidence.",
    };
  }

  if (labelOwned && hrefOwned) return { ownership: "code-owned", problem: null };
  if (labelOwned || hrefOwned) return { ownership: "mixed", problem: null };
  return { ownership: "editable", problem: null };
}
