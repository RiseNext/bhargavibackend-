/**
 * Code-owned literals the generator re-emits VERBATIM.
 *
 * 🔴 D-026: `nav`, `NavItem` and `NavChild` are structural, not content.
 * `Header.tsx:8` imports all three, so losing them is a dead deployment — not a
 * missing menu. Editable navigation was never requested and risks a
 * non-technical admin breaking the site's information architecture.
 *
 * Also here, for three different reasons:
 *
 *  · **Derived helpers** (`youtubeThumb`, `serviceBySlug`, …) are functions, not
 *    data. They stay code.
 *  · **`site.url`** is env-overridable config with a hardcoded fallback. There
 *    is no `url` column and there should not be — a wrong value per environment
 *    breaks every canonical.
 *  · **Pending-CMS prose** — strings whose CMS home is `content_blocks`, which
 *    seeds in stage **S3** behind gate 0.12. They are re-emitted verbatim so the
 *    site stays byte-identical in the meantime (D-011: the hardcoded content
 *    stays and the site keeps working until the backend is complete and
 *    verified). Each one names the gate that will replace it.
 */

/** Re-emitted exactly as `src/lib/site.ts:18` has it. */
export const SITE_URL_EXPRESSION =
  'process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.bhargavihealthworld.com"';

/** D-026 — verbatim from `src/lib/site.ts:92-108`. */
export const NAV = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Services", href: "/services" },
  {
    label: "Media",
    href: "/gallery",
    children: [
      { label: "Clinic Gallery", href: "/gallery" },
      { label: "Health Talks", href: "/videos" },
    ],
  },
  { label: "Testimonials", href: "/testimonials" },
  { label: "Blog", href: "/blog" },
  { label: "Careers", href: "/careers" },
  { label: "Contact", href: "/contact" },
];

/**
 * ✅ D-037 — code-owned chrome, re-emitted verbatim.
 *
 * `careers/page.tsx:19-21` builds a `mailto:` URL whose subject is
 * `encodeURIComponent`-wrapped and never rendered as visible copy. It is link
 * behaviour, in the same class as `site.whatsapp.href` — not administrator
 * editable content. Promoting it to a `content_blocks` row would also create a
 * second home for the business name, which already lives in
 * `site_settings.business_name`.
 *
 * ⚠ X-34 remains an open DEFECT against this string: the subject omits the role
 * while the adjacent copy asks the applicant to add it manually. Being
 * code-owned makes that a one-line fix in Phase 7 — not a reason to skip it.
 */
export const MAILTO_SUBJECT = "Job application — Bhargavi Health World";

/**
 * ✅ D-037 — the service hero's alt text is DERIVED, not stored.
 *
 * `services/[slug]/page.tsx:112` renders ``alt={`${service.title} at ${site.name}`}``.
 * There is no authored alt value to preserve — the snapshot records it as the
 * placeholder `"<service.title> at Bhargavi Health World"`, which is the proof.
 * The generator emits this helper so the rendered markup stays byte-identical
 * and **no alt value is invented**.
 */
export function serviceHeroAlt(serviceTitle, businessName) {
  return `${serviceTitle} at ${businessName}`;
}

/**
 * Prose still awaiting its CMS home.
 *
 * `homeIntro` belongs in `content_blocks` (`home.intro`), which seeds in S3 —
 * blocked on gate 0.12's slot taxonomy. `treatmentsIntro` is **dead code**:
 * exported but rendered on no page, so it is preserved rather than seeded
 * (R-20 — its intended slot is unconfirmed).
 *
 * Both are byte-identical copies from `src/content/site-content.ts`.
 */
export const PENDING_CMS_PROSE = {
  /** TODO(gate 0.12 / S3): source from content_blocks `home.intro`. */
  homeIntro:
    "Mrs Anjana Bhargavi is the brain child behind the inspiring and exceptional Bhargavi Health World — a centre dedicated to providing world class treatments and counselling in alternate medicine which are tried, tested and proven to be effective. She believes “The only way to do great work is to love what you do”, and she has most definitely poured her heart and soul into the centre and into every patient's well being.",
  /** Dead code (R-20). Preserved, deliberately NOT seeded. */
  treatmentsIntro:
    "Alternative medicine plays a vital role in holistic health by offering diverse therapeutic options that may complement conventional treatments. It emphasizes treating the whole person — mind, body, and spirit — rather than just symptoms. Techniques such as acupuncture, chiropractic care, and nutrition can alleviate chronic conditions, reduce stress, and improve quality of life.",
};

/**
 * The generated-file banner.
 *
 * Generated files are **committed** (D-016), so a build never depends on the
 * API and a rollback is a `git revert`. The banner is what stops someone
 * hand-editing a file that the next build will overwrite.
 */
export function banner(source) {
  return `/**
 * ⚠ GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Produced by \`scripts/generate-content.mjs\` from ${source}.
 * Run \`npm run generate:content\` to refresh; the result is committed so a
 * build never depends on the API being reachable (D-016).
 *
 * Hand edits are lost on the next build. Change the content in the admin panel.
 */

`;
}
