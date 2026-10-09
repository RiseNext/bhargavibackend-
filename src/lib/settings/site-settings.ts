/**
 * Assembles the `GET /api/site-settings` payload — public operation 17, "the
 * big one", logical Phase **8a**, executing as **E9 before the generator**
 * (D-033).
 *
 * It is the single source for `frontend/src/lib/site.ts` plus the `stats`
 * export in `site-content.ts`, and it has roughly 25 downstream consumers.
 *
 * Two rules dominate the shape:
 *  · **D-029** — the five global location fields resolve PER FIELD from the
 *    first active branch by `sort_order` holding a value, never `is_primary`.
 *  · **D-028** — hours are returned in the **structured** model only. The
 *    `{days, time}` display shape is produced by the GENERATOR. Returning the
 *    display shape here would put the transform in two places.
 */

import { query, queryOne } from "../db";
import {
  activeOnly,
  byDisplayOrder,
  byPhoneOrder,
  missingRequiredGlobals,
  primaryBranch,
  resolveGlobals,
  type HoursDay,
  type ResolvableBranch,
  type ResolvedGlobals,
} from "./resolve";

interface SettingsRow {
  business_name: string;
  short_name: string;
  tagline: string | null;
  description: string | null;
  locale: string;
  founder_name: string | null;
  founder_honorific: string | null;
  founder_qualifications: string | null;
  founder_role: string | null;
  founder_photo_url: string | null;
  public_email: string | null;
  default_whatsapp_e164: string | null;
  price_range: string | null;
  logo_url: string | null;
  logo_lockup_url: string | null;
  og_url: string | null;
  brand_color: string | null;
  theme_color: string | null;
  default_seo_title_template: string | null;
  default_seo_description: string | null;
  robots_allow: boolean;
  analytics_measurement_id: string | null;
  updated_at: Date;
}

interface BranchRow {
  id: string;
  slug: string;
  name: string;
  is_primary: boolean;
  is_active: boolean;
  sort_order: number;
  phone_sort_order: number;
  created_at: Date;
  phone_label: string | null;
  phone_e164: string | null;
  whatsapp_e164: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal: string | null;
  address_country: string | null;
  address_full: string | null;
  lat: number | null;
  lng: number | null;
  maps_url: string | null;
  map_embed_src: string | null;
  hours: HoursDay[] | null;
  notify_email: string | null;
}

function toResolvable(r: BranchRow): ResolvableBranch {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    isPrimary: r.is_primary,
    isActive: r.is_active,
    sortOrder: r.sort_order,
    phoneSortOrder: r.phone_sort_order,
    createdAt: r.created_at,
    phoneLabel: r.phone_label,
    phoneE164: r.phone_e164,
    whatsappE164: r.whatsapp_e164,
    addressLine1: r.address_line1,
    addressLine2: r.address_line2,
    addressCity: r.address_city,
    addressState: r.address_state,
    addressPostal: r.address_postal,
    addressCountry: r.address_country,
    addressFull: r.address_full,
    lat: r.lat === null ? null : Number(r.lat),
    lng: r.lng === null ? null : Number(r.lng),
    mapsUrl: r.maps_url,
    mapEmbedSrc: r.map_embed_src,
    hours: r.hours,
    notifyEmail: r.notify_email,
  };
}

export async function loadBranches(): Promise<ResolvableBranch[]> {
  const rows = await query<BranchRow>(
    `SELECT id::text AS id, slug, name, is_primary, is_active, sort_order,
            phone_sort_order, created_at, phone_label, phone_e164, whatsapp_e164,
            address_line1, address_line2, address_city, address_state,
            address_postal, address_country, address_full,
            lat, lng, maps_url, map_embed_src, hours, notify_email
       FROM branches
      ORDER BY sort_order, created_at, id`,
  );
  return rows.map(toResolvable);
}

/**
 * `site.phones[]` — the exact shape the frontend consumes.
 *
 * 🔴 Ordered by `phone_sort_order`, which is INDEPENDENT of `sort_order`
 * (D-013). Eight occurrences across five UI surfaces read `phones[0]`, and five
 * further surfaces `.map` over both and are order-sensitive. Getting this wrong
 * silently shows the wrong branch's number on the floating call button, the
 * `/contact` hero CTA and the closing CTA band.
 */
export interface PhoneEntry {
  label: string;
  href: string;
  branch: string;
}

export function derivePhones(branches: readonly ResolvableBranch[]): PhoneEntry[] {
  return byPhoneOrder(activeOnly(branches))
    .filter((b) => b.phoneLabel !== null && b.phoneE164 !== null)
    .map((b) => ({
      label: b.phoneLabel ?? "",
      // `tel:` with the E.164 form, exactly as the live site emits it.
      href: `tel:${b.phoneE164 ?? ""}`,
      branch: b.name,
    }));
}

/** `site.branches[]` — ordered by `sort_order`, so `branches[0]` stays Chikkadpally. */
export interface BranchEntry {
  slug: string;
  name: string;
  phone: string;
  whatsapp: string;
  isPrimary: boolean;
  /** Present only where the branch actually holds one. Never invented. */
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    full: string | null;
  } | null;
  geo: { lat: number; lng: number } | null;
  mapsUrl: string | null;
  mapEmbedSrc: string | null;
  hours: HoursDay[] | null;
}

export function deriveBranches(branches: readonly ResolvableBranch[]): BranchEntry[] {
  return byDisplayOrder(activeOnly(branches)).map((b) => ({
    slug: b.slug,
    name: b.name,
    phone: b.phoneLabel ?? "",
    whatsapp: b.whatsappE164 ?? "",
    isPrimary: b.isPrimary,
    address:
      b.addressLine1 !== null || b.addressFull !== null
        ? {
            line1: b.addressLine1,
            line2: b.addressLine2,
            city: b.addressCity,
            state: b.addressState,
            postalCode: b.addressPostal,
            country: b.addressCountry,
            full: b.addressFull,
          }
        : null,
    geo: b.lat !== null && b.lng !== null ? { lat: b.lat, lng: b.lng } : null,
    mapsUrl: b.mapsUrl,
    mapEmbedSrc: b.mapEmbedSrc,
    hours: b.hours,
  }));
}

/**
 * 🔴 X-23 — `site.whatsapp.href` is an `api.whatsapp.com` URL with
 * `&text=hello&lang=en`, **not** a `wa.me` link.
 *
 * Rebuilding it as `wa.me/<digits>` would change the behaviour of the floating
 * WhatsApp button, the `/contact` hero button and the `/contact` Hours card. The
 * exact form is re-emitted, including the query string.
 */
export function whatsappHref(numberE164: string): string {
  return `https://api.whatsapp.com/send?phone=${numberE164}&text=hello&lang=en`;
}

export interface StatEntry {
  value: number;
  suffix: string;
  label: string;
  /** D-023 — the hero's own wording. `heroLabel ?? label` at render time. */
  heroLabel: string | null;
  showInHero: boolean;
}

export interface SocialEntry {
  name: string;
  href: string;
  iconKey: string;
}

export interface SiteSettingsPayload {
  name: string;
  shortName: string;
  tagline: string | null;
  description: string | null;
  locale: string;

  founder: {
    name: string | null;
    honorific: string | null;
    qualifications: string | null;
    role: string | null;
    photo: string | null;
  };

  phones: PhoneEntry[];
  branches: BranchEntry[];
  whatsapp: { number: string; href: string } | null;
  email: string | null;

  /** D-029: first-with-value by `sort_order`, never `is_primary`. */
  address: ResolvedGlobals["address"];
  geo: ResolvedGlobals["geo"];
  mapsUrl: string | null;
  mapEmbedSrc: string | null;
  /** D-028: STRUCTURED only. The generator produces the display shape. */
  hours: HoursDay[] | null;

  priceRange: string | null;
  socials: SocialEntry[];
  stats: StatEntry[];

  logo: string | null;
  logoLockup: string | null;
  ogImage: string | null;
  brandColor: string | null;
  themeColor: string | null;

  seo: {
    titleTemplate: string | null;
    description: string | null;
    robotsAllow: boolean;
  };
  analyticsMeasurementId: string | null;

  /**
   * Diagnostics the generator and the branches admin both need: which branch
   * supplied each resolved field, and which required fields are missing.
   */
  resolution: {
    provenance: ResolvedGlobals["provenance"];
    missingRequired: string[];
    missingMedia: string[];
  };

  /** A REAL timestamp — it feeds `sitemap.xml` `lastModified`. */
  updatedAt: string;
}

export async function buildSiteSettings(): Promise<SiteSettingsPayload> {
  const settings = await queryOne<SettingsRow>(
    `SELECT s.business_name, s.short_name, s.tagline, s.description, s.locale,
            s.founder_name, s.founder_honorific, s.founder_qualifications, s.founder_role,
            fp.secure_url AS founder_photo_url,
            s.public_email, s.default_whatsapp_e164, s.price_range,
            lg.secure_url AS logo_url,
            ll.secure_url AS logo_lockup_url,
            og.secure_url AS og_url,
            s.brand_color, s.theme_color,
            s.default_seo_title_template, s.default_seo_description, s.robots_allow,
            s.analytics_measurement_id, s.updated_at
       FROM site_settings s
       LEFT JOIN media fp ON fp.id = s.founder_photo_media_id AND fp.deleted_at IS NULL
       LEFT JOIN media lg ON lg.id = s.logo_media_id          AND lg.deleted_at IS NULL
       LEFT JOIN media ll ON ll.id = s.logo_lockup_media_id   AND ll.deleted_at IS NULL
       LEFT JOIN media og ON og.id = s.og_media_id            AND og.deleted_at IS NULL
      WHERE s.id = 1`,
  );

  if (!settings) {
    throw new Error(
      "site_settings has no row — seed stage S1 has not run (npm run seed -- --stage s1)",
    );
  }

  const branches = await loadBranches();
  const resolved = resolveGlobals(branches);
  const primary = primaryBranch(branches);

  const socialRows = await query<{ platform: string; url: string; icon_key: string }>(
    `SELECT platform, url, icon_key FROM social_links
      WHERE published ORDER BY sort_order, platform, id`,
  );

  const statRows = await query<{
    value: number;
    suffix: string | null;
    label: string;
    hero_label: string | null;
    show_in_hero: boolean;
  }>(
    `SELECT value, suffix, label, hero_label, show_in_hero FROM stats
      WHERE published ORDER BY sort_order, created_at, id`,
  );

  // `site.whatsapp` is the ONE field that comes from `is_primary` (D-029) —
  // Bowenpally, matching the live site's default WhatsApp channel. Falls back to
  // the settings column if no branch is flagged.
  const whatsappNumber = primary?.whatsappE164 ?? settings.default_whatsapp_e164;

  // X-25: a NULL media reference would make the generator emit an empty `src`,
  // losing the Header, Footer, Preloader and every OG card image with a green
  // build. Reported here so the generator can fail loudly.
  const missingMedia: string[] = [];
  if (settings.logo_url === null) missingMedia.push("logo");
  if (settings.logo_lockup_url === null) missingMedia.push("logoLockup");
  if (settings.og_url === null) missingMedia.push("ogImage");
  if (settings.founder_photo_url === null) missingMedia.push("founderPhoto");

  return {
    name: settings.business_name,
    shortName: settings.short_name,
    tagline: settings.tagline,
    description: settings.description,
    locale: settings.locale,

    founder: {
      name: settings.founder_name,
      honorific: settings.founder_honorific,
      qualifications: settings.founder_qualifications,
      role: settings.founder_role,
      photo: settings.founder_photo_url,
    },

    phones: derivePhones(branches),
    branches: deriveBranches(branches),
    whatsapp:
      whatsappNumber === null
        ? null
        : { number: whatsappNumber, href: whatsappHref(whatsappNumber) },
    email: settings.public_email,

    address: resolved.address,
    geo: resolved.geo,
    mapsUrl: resolved.mapsUrl,
    mapEmbedSrc: resolved.mapEmbedSrc,
    hours: resolved.hours,

    priceRange: settings.price_range,

    socials: socialRows.map((s) => ({
      name: s.platform,
      href: s.url,
      iconKey: s.icon_key,
    })),

    stats: statRows.map((s) => ({
      value: s.value,
      // The frontend's `suffix` is "" for "Therapies offered", not null.
      suffix: s.suffix ?? "",
      label: s.label,
      heroLabel: s.hero_label,
      showInHero: s.show_in_hero,
    })),

    logo: settings.logo_url,
    logoLockup: settings.logo_lockup_url,
    ogImage: settings.og_url,
    brandColor: settings.brand_color,
    themeColor: settings.theme_color,

    seo: {
      titleTemplate: settings.default_seo_title_template,
      description: settings.default_seo_description,
      robotsAllow: settings.robots_allow,
    },
    analyticsMeasurementId: settings.analytics_measurement_id,

    resolution: {
      provenance: resolved.provenance,
      missingRequired: missingRequiredGlobals(resolved),
      missingMedia,
    },

    updatedAt: settings.updated_at.toISOString(),
  };
}
