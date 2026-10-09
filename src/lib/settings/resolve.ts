/**
 * 🔴 D-029 — per-field global-field resolution.
 *
 * `GET /api/site-settings` and the generator must **never** derive a global
 * field from the `is_primary` branch.
 *
 * Why this exists, concretely: `is_primary` is **Bowenpally**, whose
 * `address_*`, `lat`/`lng`, `maps_url`, `map_embed_src` and `hours` are **all
 * NULL** — and D-006 forbids inventing them. Deriving from `is_primary` empties
 * the footer address, the `/contact` Visit and Hours cards, the AppointmentBand
 * Visit row, the `/careers` hours line and the `PostalAddress` +
 * `GeoCoordinates` JSON-LD — **with a green build and no error.**
 *
 * Algorithm (verbatim from the decision):
 *   resolve(field) = branches
 *     .filter(is_active)
 *     .sortBy(sort_order ASC, created_at ASC)
 *     .find(b => hasValue(b, field)) ?? null
 *
 * Resolution is **per field**, not per branch: two different branches may
 * legitimately supply `address` and `hours`.
 */

export interface HoursWindow {
  open: string;
  close: string;
}

export interface HoursDay {
  /** 0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay()`. */
  day: number;
  windows: HoursWindow[];
}

/** A branch as the resolver sees it. Deliberately all-nullable but `id`/`name`. */
export interface ResolvableBranch {
  id: string;
  slug: string;
  name: string;
  isPrimary: boolean;
  isActive: boolean;
  sortOrder: number;
  phoneSortOrder: number;
  createdAt: Date;

  phoneLabel: string | null;
  phoneE164: string | null;
  whatsappE164: string | null;

  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostal: string | null;
  addressCountry: string | null;
  addressFull: string | null;

  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
  mapEmbedSrc: string | null;
  hours: HoursDay[] | null;
  notifyEmail: string | null;
}

/** The five fields that resolve first-with-value by `sort_order`. */
export type ResolvableField = "address" | "geo" | "mapsUrl" | "mapEmbedSrc" | "hours";

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * `hasValue` per field — exactly as D-029 defines it.
 *
 * The address rule matters: **a partial address is not a value**. A branch with
 * only a city would otherwise win the resolution and render a half address,
 * which is worse than rendering nothing because it looks deliberate.
 */
export function hasValue(branch: ResolvableBranch, field: ResolvableField): boolean {
  switch (field) {
    case "address":
      return (
        nonEmpty(branch.addressLine1) &&
        nonEmpty(branch.addressCity) &&
        nonEmpty(branch.addressPostal)
      );
    case "geo":
      return branch.lat !== null && branch.lng !== null;
    case "mapsUrl":
      return nonEmpty(branch.mapsUrl);
    case "mapEmbedSrc":
      return nonEmpty(branch.mapEmbedSrc);
    case "hours":
      // "At least one day with at least one window." An empty array, or seven
      // days of zero windows, is not opening hours.
      return (
        branch.hours !== null &&
        branch.hours.length > 0 &&
        branch.hours.some((d) => d.windows.length > 0)
      );
  }
}

/** Display order: `sort_order` ascending, ties broken by `created_at`. */
export function byDisplayOrder(branches: readonly ResolvableBranch[]): ResolvableBranch[] {
  return [...branches].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

/** 🔴 D-013: an INDEPENDENT ordering. Never derived from `sort_order`. */
export function byPhoneOrder(branches: readonly ResolvableBranch[]): ResolvableBranch[] {
  return [...branches].sort(
    (a, b) =>
      a.phoneSortOrder - b.phoneSortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export const activeOnly = (branches: readonly ResolvableBranch[]): ResolvableBranch[] =>
  branches.filter((b) => b.isActive);

/**
 * The resolver. Returns the winning BRANCH so the caller can read the field and
 * — just as importantly — report which branch supplied it.
 */
export function resolveBranchFor(
  branches: readonly ResolvableBranch[],
  field: ResolvableField,
): ResolvableBranch | null {
  return byDisplayOrder(activeOnly(branches)).find((b) => hasValue(b, field)) ?? null;
}

/**
 * `site.whatsapp` is the ONE field that legitimately comes from `is_primary`
 * (= Bowenpally), because `site.whatsapp.number` in the live frontend is
 * Bowenpally's number and D-003/D-010 require preserving that.
 */
export function primaryBranch(branches: readonly ResolvableBranch[]): ResolvableBranch | null {
  return activeOnly(branches).find((b) => b.isPrimary) ?? null;
}

export interface ResolvedAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  full: string | null;
}

export interface ResolvedGeo {
  lat: number;
  lng: number;
}

export interface ResolvedGlobals {
  address: ResolvedAddress | null;
  geo: ResolvedGeo | null;
  mapsUrl: string | null;
  mapEmbedSrc: string | null;
  hours: HoursDay[] | null;
  /**
   * Which branch supplied each field. Not decoration — the branches admin must
   * be able to explain to an editor why entering Bowenpally's address did not
   * change the footer (§F.2, the D-029 warning).
   */
  provenance: Record<ResolvableField, string | null>;
}

export function resolveGlobals(branches: readonly ResolvableBranch[]): ResolvedGlobals {
  const addressBranch = resolveBranchFor(branches, "address");
  const geoBranch = resolveBranchFor(branches, "geo");
  const mapsBranch = resolveBranchFor(branches, "mapsUrl");
  const embedBranch = resolveBranchFor(branches, "mapEmbedSrc");
  const hoursBranch = resolveBranchFor(branches, "hours");

  return {
    address: addressBranch
      ? {
          line1: addressBranch.addressLine1,
          line2: addressBranch.addressLine2,
          city: addressBranch.addressCity,
          state: addressBranch.addressState,
          postalCode: addressBranch.addressPostal,
          country: addressBranch.addressCountry,
          full: addressBranch.addressFull,
        }
      : null,
    geo:
      geoBranch && geoBranch.lat !== null && geoBranch.lng !== null
        ? { lat: geoBranch.lat, lng: geoBranch.lng }
        : null,
    mapsUrl: mapsBranch?.mapsUrl ?? null,
    mapEmbedSrc: embedBranch?.mapEmbedSrc ?? null,
    hours: hoursBranch?.hours ?? null,
    provenance: {
      address: addressBranch?.slug ?? null,
      geo: geoBranch?.slug ?? null,
      mapsUrl: mapsBranch?.slug ?? null,
      mapEmbedSrc: embedBranch?.slug ?? null,
      hours: hoursBranch?.slug ?? null,
    },
  };
}

/**
 * 🔴 D-029 fail-loud rule.
 *
 * `address`, `geo` and `hours` each have a live consumer, so resolving to null
 * is a silent content loss rather than graceful degradation. The API still
 * SERVES the nulls — it is a read endpoint and must not 500 — but the generator
 * calls this and refuses to emit. Returning the list rather than throwing lets
 * the caller decide, and lets a test assert the exact set.
 */
export function missingRequiredGlobals(resolved: ResolvedGlobals): ResolvableField[] {
  const missing: ResolvableField[] = [];
  if (resolved.address === null) missing.push("address");
  if (resolved.geo === null) missing.push("geo");
  if (resolved.hours === null) missing.push("hours");
  return missing;
}
