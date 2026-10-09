/**
 * Privacy-policy publication guard — E17 / D-021.
 *
 * The policy reaches the site as `content_blocks` rows on `page = 'privacy'`,
 * edited through the normal page-copy admin. What is special is **when it may go
 * live**.
 *
 * 🔴 The approved draft (`docs/PRIVACY-POLICY-DRAFT.md`) carries **ten
 * `UNKNOWN — CLIENT INPUT REQUIRED` markers**, and every one is a legal or
 * business fact rather than a wording choice:
 *
 *   1. date of publication
 *   2. whether analytics are used, once added
 *   3. whether to state a specific legal basis
 *   4. how long unsuccessful applications and CVs are kept
 *   5. whether to name hosting and database sub-processors
 *   6. final retention periods
 *   7. which data-protection law applies
 *   8. the clinic's postal address
 *   9. the registered business/legal entity name
 *  10. any business registration number
 *
 * **None of these may be invented.** A privacy policy that misstates a
 * retention period, a legal basis or the legal entity is a legal exposure, not
 * a content gap — which is materially worse than having no policy page yet.
 *
 * So the content is editable now, and this module stops it being PUBLISHED
 * while any marker survives. B10 (client approval) remains the gate; this makes
 * the gate mechanical instead of a promise in a document.
 */

import { query } from "../db";

/** The exact marker the draft and the seed use. Matched case-sensitively. */
export const UNKNOWN_MARKER = "UNKNOWN — CLIENT INPUT REQUIRED";

/** The ten items the client must supply, for the admin to display as a checklist. */
export const REQUIRED_CLIENT_INPUTS = [
  "Date of publication",
  "Whether website analytics are used (and which)",
  "Whether to state a specific legal basis for processing",
  "How long unsuccessful applications and CVs are kept",
  "Whether to name hosting and database sub-processors",
  "Final retention periods for each data class",
  "Which data-protection law the clinic is subject to",
  "The clinic's postal address",
  "The registered business / legal entity name",
  "Any business registration number",
] as const;

export interface PrivacyReadiness {
  /** True when a `privacy` page has content blocks at all. */
  exists: boolean;
  blockCount: number;
  /** Slots still containing an unresolved marker. */
  slotsWithMarkers: string[];
  /** True only when content exists and no marker remains. */
  publishable: boolean;
  requiredClientInputs: readonly string[];
  explanation: string;
}

/**
 * Scans the privacy page's blocks for unresolved markers.
 *
 * Checks `label`, `title`, `lead`, every `body` paragraph and every `extra`
 * value — a marker left in any of them would be published verbatim.
 */
export async function privacyReadiness(): Promise<PrivacyReadiness> {
  const rows = await query<{
    slot: string;
    label: string | null;
    title: string | null;
    lead: string | null;
    body: string[] | null;
    extra: Record<string, unknown> | null;
  }>(
    `SELECT slot, label, title, lead, body, extra
       FROM content_blocks WHERE page = 'privacy' ORDER BY slot`,
  );

  const slotsWithMarkers: string[] = [];

  for (const row of rows) {
    const haystack = [
      row.label ?? "",
      row.title ?? "",
      row.lead ?? "",
      ...(row.body ?? []),
      row.extra === null ? "" : JSON.stringify(row.extra),
    ].join("\n");

    if (haystack.includes(UNKNOWN_MARKER)) slotsWithMarkers.push(row.slot);
  }

  const exists = rows.length > 0;

  return {
    exists,
    blockCount: rows.length,
    slotsWithMarkers,
    publishable: exists && slotsWithMarkers.length === 0,
    requiredClientInputs: REQUIRED_CLIENT_INPUTS,
    explanation: !exists
      ? "No privacy content has been seeded yet. The approved draft is in " +
        "docs/PRIVACY-POLICY-DRAFT.md; transcribing it is a mechanical task, but it carries " +
        "ten UNKNOWN markers that only the client can resolve."
      : slotsWithMarkers.length > 0
        ? `${String(slotsWithMarkers.length)} slot(s) still contain "${UNKNOWN_MARKER}". ` +
          "The page must not be published until every one is resolved — a policy that " +
          "misstates a retention period or the legal entity is a legal exposure, not a " +
          "content gap."
        : "No unresolved markers remain. The policy is ready for the client's final approval " +
          "(B10), which is a sign-off rather than a technical step.",
  };
}

/**
 * 🔴 Launch gate.
 *
 * `SECURITY`/D-021 are explicit that launching without `/privacy` is **not an
 * option while the site collects free-text health complaints**. This is the
 * assertion the deployment checklist calls, so the condition is checked by code
 * rather than remembered.
 */
export async function assertPrivacyReadyForLaunch(): Promise<void> {
  const readiness = await privacyReadiness();
  if (readiness.publishable) return;

  throw new Error(
    `Privacy policy is not ready for launch.\n  ${readiness.explanation}\n` +
      (readiness.slotsWithMarkers.length > 0
        ? `  Slots: ${readiness.slotsWithMarkers.join(", ")}\n`
        : "") +
      `  Outstanding client inputs:\n${REQUIRED_CLIENT_INPUTS.map((i) => `    - ${i}`).join("\n")}`,
  );
}
