/**
 * The `content_blocks.extra` key allowlist — ✅ D-024.
 *
 * `extra` is a NAMED-FIELD escape hatch with a schema, not an untyped bucket:
 * an unknown key is rejected on write. Every entry below is a real field in the
 * content snapshot — nothing is invented.
 *
 * This lives in `src/lib/` rather than beside the seed script because the
 * RUNTIME owns the schema and the seed consumes it. The dependency ran the
 * other way at first, which would have pulled seed-script code into the
 * application bundle.
 */

/** Per-slot allowlist, keyed `page.slot`, or by bare slot for single-slot pages. */
export const EXTRA_ALLOWLIST: Record<string, readonly string[]> = {
  // 🔴 `supportingCopy` REMOVED — it is code-owned (PUB-02). The live hero
  // renders it with the founder's name interpolated, so a stored copy would
  // freeze that name. `home.hero` now has no editable extra field at all, so
  // the slot is absent from this allowlist entirely rather than listed empty.

  "home.intro": ["sinceCard"],
  "home.appointmentBand": ["formCardTitle", "formCardNote"],
  "about.story": ["pullQuote", "pullQuoteCaption"],
  "blog.comingSoon": ["secondary"],
  // `asideTitle` REMOVED — code-owned (PUB-02): the live aside italicises one
  // word and the captured value carries no `*marker*`, so a stored copy would
  // silently lose the emphasis. `asideLead` is ordinary copy.
  "careers.openings": ["asideLead"],
  // `resumeInstruction` REMOVED — code-owned (PUB-02): it renders
  // `<a href={mailtoHref}>{site.email}</a>`, so it is a LINK built from an
  // admin-managed address, not text. The other two keys are real copy.
  "careers.apply": ["callLabel", "formRoleDefault"],
  // 🔴 `indexBadge`, `metaLine` and `modalAriaLabel` are deliberately ABSENT.
  // The derivation stored a DESCRIPTION OF A FORMAT in each of them rather than
  // any copy — "01, 02, ... (1-based, zero-padded)", "<type> · <branch> ·
  // <experience>", "Apply — <job.title>". All three are computed by the card
  // from `job` fields, so there is nothing for an administrator to edit: the
  // best case was a field whose edits moved nothing, and the worst was a page
  // printing the literal angle brackets. Code-owned under D-040, like
  // `careers.mailtoSubject` before them (D-037). The five below are real copy.
  "careers.jobCards": [
    "applyButton",
    "responsibilitiesHeading",
    "requirementsHeading",
    "modalLabel",
    "modalCloseLabel",
  ],
  "contact.map": ["captionBelow"],
  // E17 — the "Last updated" date the policy commits to showing (§11). It is a
  // client fact, so it seeds as an UNKNOWN marker and is resolved in the admin.
  "privacy.intro": ["lastUpdated"],
  "serviceDetail.bookingAside": ["note"],
  notFound: ["bigNumeral"],
};

export function allowedExtraKeys(page: string, slot: string): readonly string[] {
  return EXTRA_ALLOWLIST[`${page}.${slot}`] ?? EXTRA_ALLOWLIST[slot] ?? [];
}

/**
 * Returns a problem per unknown key. Rejecting rather than silently dropping
 * matters: an editor who mistypes a key would otherwise save successfully and
 * see nothing change.
 */
export function validateExtra(
  page: string,
  slot: string,
  extra: Record<string, unknown> | null | undefined,
): string[] {
  if (!extra) return [];
  const allowed = new Set(allowedExtraKeys(page, slot));
  return Object.keys(extra)
    .filter((key) => !allowed.has(key))
    .map((key) => `${page}.${slot}: "${key}" is not an allowed extra key`);
}
