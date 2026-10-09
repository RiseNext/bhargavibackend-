/**
 * Reads the immutable content snapshot and normalises it into row shapes.
 *
 * 🔒 `docs/CURRENT-FRONTEND-CONTENT/` is the documented seed source of truth
 * (DB design §8). Per D-003 this is real production content, not demo data —
 * so it is READ, never retyped and never "improved" during seeding. This module
 * only reads; it never writes to the snapshot.
 *
 * Where the frontend has no value — Bowenpally's address, coordinates, map and
 * hours — the field stays NULL. Inventing one would violate the
 * no-hallucination rule, and a NULL is what makes the gap visible in the admin.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SNAPSHOT = resolve(ROOT, "docs", "CURRENT-FRONTEND-CONTENT");
const DATA = resolve(SNAPSHOT, "data");

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(DATA, file), "utf8")) as T;
}

/** The one real email address in the entire frontend (D-004, D-020). */
export const INITIAL_NOTIFY_EMAIL = "bhargavihealthworld@gmail.com";

/** D-003 supplies these for all 10 services — exactly what the site shows today. */
export const INITIAL_PRICE_FROM_PAISE = 10_000; // ₹100
export const INITIAL_TYPICAL_COURSE = "2–4 sittings";

/** E.164 from a display string: "+91 98663 76203" → "+919866376203". */
export function toE164(display: string): string {
  const compact = display.replace(/[^\d+]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) {
    throw new Error(`Cannot normalise "${display}" to E.164`);
  }
  return compact;
}

// ---------------------------------------------------------------------------
// site.ts
// ---------------------------------------------------------------------------

interface SiteSnapshot {
  site: {
    name: string;
    shortName: string;
    tagline: string;
    description: string;
    locale: string;
    founder: {
      name: string;
      honorific: string;
      qualifications: string;
      role: string;
      photo: string;
    };
    phones: Array<{ label: string; href: string; branch: string }>;
    branches: Array<{ name: string; phone: string; whatsapp: string }>;
    whatsapp: { number: string; href: string };
    email: string;
    address: {
      line1: string;
      line2: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
      full: string;
    };
    geo: { lat: number; lng: number };
    mapsUrl: string;
    mapEmbedSrc: string;
    priceRange: string;
    hours: Array<{ days: string; time: string }>;
    socials: Array<{ name: string; href: string }>;
    logo: string;
    logoLockup: string;
    brandColor: string;
    ogImage: string;
  };
}

export const siteSnapshot = (): SiteSnapshot["site"] =>
  readJson<SiteSnapshot>("site-settings.json").site;

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

/**
 * Structured hours, backend shape (P-008): per-day, multi-window,
 * split-shift-capable. The frontend's `{days, time}` display shape is produced
 * by the generator (D-028), never stored.
 */
export interface HoursWindow {
  open: string;
  close: string;
}
export interface HoursDay {
  /**
   * 🔴 INTEGER, 0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay()`.
   *
   * This was a day-NAME string until migration 012. The admin write schema and
   * `HoursDay` in `src/lib/settings/resolve.ts` always used the numeric model,
   * so the seed was writing a second encoding of the same fact — and the first
   * hours edit an administrator saved converted that branch, which made
   * `isOutsideHours()` flag every appointment as out-of-hours. Keep this
   * numeric: `branches_hours_canonical_day` now rejects anything else.
   */
  day: number;
  windows: HoursWindow[];
}

/**
 * Monday-first, which is the order the hours are displayed in and the order the
 * original site listed them. The VALUES are `getDay()` indices, so the array is
 * deliberately not 0..6 in sequence.
 */
export const DAYS_MON_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

/** D-005: Mon–Sun 9:00 AM – 9:00 PM is the initial value, from the live site. */
export const INITIAL_HOURS: HoursDay[] = DAYS_MON_FIRST.map((day) => ({
  day,
  windows: [{ open: "09:00", close: "21:00" }],
}));

export interface BranchSeed {
  slug: string;
  name: string;
  isPrimary: boolean;
  sortOrder: number;
  phoneSortOrder: number;
  phoneLabel: string;
  phoneE164: string;
  whatsappE164: string;
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
  notifyEmail: string;
  isActive: boolean;
}

/**
 * The two branches, with BOTH ordering columns seeded independently (D-013).
 *
 * 🔴 `sort_order` gives `branches[] = [Chikkadpally, Bowenpally]` while
 * `phone_sort_order` gives `phones[] = [Bowenpally, Chikkadpally]`. The arrays
 * are exact reverses in the live frontend; deriving one from the other silently
 * flips 8 rendered phone numbers across 5 surfaces, or mispairs the JSON-LD
 * telephone with the Chikkadpally address.
 *
 * 🔴 Bowenpally is `is_primary` — and its address, geo, maps and hours are ALL
 * NULL. That is exactly why D-029 forbids deriving global site fields from
 * `is_primary`.
 */
export function branchSeeds(): BranchSeed[] {
  const site = siteSnapshot();

  const chikkadpally = site.branches.find((b) => b.name === "Chikkadpally");
  const bowenpally = site.branches.find((b) => b.name === "Bowenpally");
  if (!chikkadpally || !bowenpally) {
    throw new Error("Snapshot does not contain both expected branches");
  }

  return [
    {
      slug: "chikkadpally",
      name: chikkadpally.name,
      isPrimary: false,
      sortOrder: 1,
      phoneSortOrder: 2,
      phoneLabel: chikkadpally.phone,
      phoneE164: toE164(chikkadpally.phone),
      whatsappE164: toE164(chikkadpally.whatsapp),
      // site.address/geo/maps are site-level in the source and belong to this
      // branch: the address text itself says "Chikkadpally", and layout.tsx
      // pairs it with branches[0].phone with that reasoning in a code comment.
      addressLine1: site.address.line1,
      addressLine2: site.address.line2,
      addressCity: site.address.city,
      addressState: site.address.state,
      addressPostal: site.address.postalCode,
      addressCountry: site.address.country,
      addressFull: site.address.full,
      lat: site.geo.lat,
      lng: site.geo.lng,
      mapsUrl: site.mapsUrl,
      mapEmbedSrc: site.mapEmbedSrc,
      hours: INITIAL_HOURS,
      notifyEmail: INITIAL_NOTIFY_EMAIL,
      isActive: true,
    },
    {
      slug: "bowenpally",
      name: bowenpally.name,
      // The default WhatsApp and default phone channel, hence primary.
      isPrimary: true,
      sortOrder: 2,
      phoneSortOrder: 1,
      phoneLabel: bowenpally.phone,
      phoneE164: toE164(bowenpally.phone),
      whatsappE164: toE164(bowenpally.whatsapp),
      // UNKNOWN — CLIENT INPUT REQUIRED (C-2, C-3). Not guessed from the
      // branch name, not copied from Chikkadpally.
      addressLine1: null,
      addressLine2: null,
      addressCity: null,
      addressState: null,
      addressPostal: null,
      addressCountry: null,
      addressFull: null,
      lat: null,
      lng: null,
      mapsUrl: null,
      mapEmbedSrc: null,
      hours: null,
      notifyEmail: INITIAL_NOTIFY_EMAIL,
      isActive: true,
    },
  ];
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

interface ServicesSnapshot {
  services: Array<{
    slug: string;
    title: string;
    excerpt: string;
    image: string;
    duration: string;
    copyStatus?: string;
    treats: string[];
    body: string[];
  }>;
}

export interface ServiceSeed {
  slug: string;
  title: string;
  excerpt: string;
  duration: string;
  priceFromPaise: number;
  typicalCourse: string;
  body: string[];
  treats: string[];
  copyStatus: string | null;
  sortOrder: number;
  /** Relative public path, used by S2 to match the uploaded media row. */
  imagePath: string;
}

export function serviceSeeds(): ServiceSeed[] {
  return readJson<ServicesSnapshot>("services.json").services.map((s, i) => ({
    slug: s.slug,
    title: s.title,
    excerpt: s.excerpt,
    duration: s.duration,
    // D-003: hardcoded JSX today, so these become the initial field values.
    priceFromPaise: INITIAL_PRICE_FROM_PAISE,
    typicalCourse: INITIAL_TYPICAL_COURSE,
    body: s.body,
    treats: s.treats,
    copyStatus: s.copyStatus === "source" || s.copyStatus === "rewrite" ? s.copyStatus : null,
    sortOrder: i + 1,
    imagePath: s.image,
  }));
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

interface TestimonialsSnapshot {
  testimonials: Array<{
    name: string;
    quote: string;
    when?: string;
    featured?: boolean;
  }>;
}

export interface TestimonialSeed {
  authorName: string;
  quote: string;
  /** Free text preserved verbatim; `given_on` stays NULL rather than invented. */
  whenLabel: string | null;
  featured: boolean;
  sortOrder: number;
}

export function testimonialSeeds(): TestimonialSeed[] {
  return readJson<TestimonialsSnapshot>("testimonials.json").testimonials.map((t, i) => ({
    authorName: t.name,
    quote: t.quote,
    // 17 of 23 have no date at all. `given_on` is left NULL and the original
    // free text ("a year ago") is preserved — inventing dates would violate the
    // no-hallucination rule.
    whenLabel: t.when ?? null,
    featured: t.featured === true,
    sortOrder: i + 1,
  }));
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

interface VideosSnapshot {
  videos: Array<{ id: string; title: string; translation?: string; featured?: boolean }>;
}

export interface VideoSeed {
  youtubeId: string;
  title: string;
  translation: string | null;
  featured: boolean;
  sortOrder: number;
}

export function videoSeeds(): VideoSeed[] {
  return readJson<VideosSnapshot>("videos.json").videos.map((v, i) => ({
    youtubeId: v.id,
    title: v.title,
    translation: v.translation ?? null,
    featured: v.featured === true,
    sortOrder: i + 1,
  }));
}

// ---------------------------------------------------------------------------
// Gallery (seeded in S2 — media_id is NOT NULL)
// ---------------------------------------------------------------------------

interface GallerySnapshot {
  galleryImages: Array<{ src: string; alt: string }>;
}

export interface GallerySeed {
  imagePath: string;
  /** D-003: the existing templated string is the valid initial value. */
  alt: string;
  sortOrder: number;
}

export function gallerySeeds(): GallerySeed[] {
  return readJson<GallerySnapshot>("gallery.json").galleryImages.map((g, i) => ({
    imagePath: g.src,
    alt: g.alt,
    sortOrder: i + 1,
  }));
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

interface FaqsSnapshot {
  faqs: Array<{ question: string; answer: string }>;
}

export interface FaqSeed {
  question: string;
  answer: string;
  sortOrder: number;
}

/**
 * ⚠ FAQ #4 embeds a phone number and FAQ #5 the opening hours, which makes them
 * a second stale source for settings data. Seeding rule 4 permits seeding
 * as-is and flagging; they are seeded verbatim so the rendered page is
 * byte-identical, and `flaggedFaqIndexes` records the debt for the admin.
 */
export const FLAGGED_FAQ_SORT_ORDERS = [4, 5] as const;

export function faqSeeds(): FaqSeed[] {
  return readJson<FaqsSnapshot>("faqs.json").faqs.map((f, i) => ({
    question: f.question,
    answer: f.answer,
    sortOrder: i + 1,
  }));
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

interface JobsSnapshot {
  jobs: Array<{
    slug: string;
    title: string;
    type: string;
    branch: string;
    experience: string;
    excerpt: string;
    responsibilities: string[];
    requirements: string[];
  }>;
}

export interface JobSeed {
  slug: string;
  title: string;
  employmentType: "full_time" | "part_time";
  /** Branch NAME, resolved to an id at insert time. Null ⇒ all branches. */
  branchName: string | null;
  appliesToAllBranches: boolean;
  experience: string;
  excerpt: string;
  responsibilities: string[];
  requirements: string[];
  sortOrder: number;
}

function employmentType(display: string): "full_time" | "part_time" {
  if (display === "Full-time") return "full_time";
  if (display === "Part-time") return "part_time";
  throw new Error(`Unknown employment type "${display}"`);
}

export function jobSeeds(): JobSeed[] {
  return readJson<JobsSnapshot>("jobs.json").jobs.map((j, i) => {
    // D-015: "Either branch" becomes the flag, a named branch becomes the FK.
    const all = j.branch === "Either branch";
    return {
      slug: j.slug,
      title: j.title,
      employmentType: employmentType(j.type),
      branchName: all ? null : j.branch,
      appliesToAllBranches: all,
      experience: j.experience,
      excerpt: j.excerpt,
      responsibilities: j.responsibilities,
      requirements: j.requirements,
      sortOrder: i + 1,
    };
  });
}

// ---------------------------------------------------------------------------
// Social links
// ---------------------------------------------------------------------------

export interface SocialSeed {
  platform: string;
  iconKey: string;
  url: string;
  sortOrder: number;
}

export function socialSeeds(): SocialSeed[] {
  return siteSnapshot().socials.map((s, i) => ({
    platform: s.name,
    // Footer.tsx bundles exactly three glyphs, keyed by the lower-cased name.
    iconKey: s.name.toLowerCase(),
    url: s.href,
    sortOrder: i + 1,
  }));
}

// ---------------------------------------------------------------------------
// Stats — D-023
// ---------------------------------------------------------------------------

interface StatsSnapshot {
  statsBand: { items: Array<{ value: number; suffix: string; label: string }> };
  heroStats: { items: Array<{ k: string; v: string }> };
}

export interface StatSeed {
  value: number;
  suffix: string | null;
  label: string;
  heroLabel: string | null;
  showInHero: boolean;
  sortOrder: number;
}

/**
 * ✅ D-023. The home page renders the SAME four statistics twice with DIFFERENT
 * wording — the band says "Years of expertise", the hero "Years practising".
 * `hero_label` is derived by matching the hero's formatted value ("8+") back to
 * the band row, so the mapping comes from the snapshot rather than being
 * retyped. Resolution rule at render time: `heroLabel ?? label`.
 */
export function statSeeds(): StatSeed[] {
  const { statsBand, heroStats } = readJson<StatsSnapshot>("stats.json");

  return statsBand.items.map((item, i) => {
    const formatted = `${String(item.value)}${item.suffix}`;
    const hero = heroStats.items.find((h) => h.k === formatted);

    return {
      value: item.value,
      suffix: item.suffix === "" ? null : item.suffix,
      label: item.label,
      // NULL where the hero wording is identical to the band's, so the
      // fallback path is genuinely exercised.
      heroLabel: hero && hero.v !== item.label ? hero.v : null,
      showInHero: hero !== undefined,
      sortOrder: i + 1,
    };
  });
}

// ---------------------------------------------------------------------------
// Content list items
// ---------------------------------------------------------------------------

export type ContentCollection =
  | "why_choose_us"
  | "process"
  | "philosophy"
  | "achievements"
  | "about_story";

export interface ContentListSeed {
  collection: ContentCollection;
  stepLabel: string | null;
  title: string | null;
  text: string;
  /** Relative public path for the why-us icons; resolved to media in S2. */
  iconPath: string | null;
  sortOrder: number;
}

interface PageContentSnapshot {
  contentFileProse: {
    keys: Record<string, unknown>;
  };
  about: {
    slots: {
      philosophy: { items: Array<{ title: string; text: string }> };
    };
  };
}

/**
 * 19 rows: whyChooseUs 4 + process 4 + philosophy 3 + achievements 5 +
 * about_story 3.
 *
 * ⚠ `philosophy` lives inside `about/page.tsx`, not a content file — it is read
 * from the page snapshot rather than the content snapshot, which is the one
 * place this migration is easy to miss.
 */
export function contentListSeeds(): ContentListSeed[] {
  const prose = readJson<PageContentSnapshot>("page-content.json");
  const content = contentFileExports();

  const rows: ContentListSeed[] = [];

  content.whyChooseUs.forEach((w, i) => {
    rows.push({
      collection: "why_choose_us",
      stepLabel: null,
      title: w.title,
      text: w.text,
      iconPath: w.icon,
      sortOrder: i + 1,
    });
  });

  content.process.forEach((p, i) => {
    rows.push({
      collection: "process",
      stepLabel: p.step,
      title: p.title,
      text: p.text,
      iconPath: null,
      sortOrder: i + 1,
    });
  });

  prose.about.slots.philosophy.items.forEach((p, i) => {
    rows.push({
      collection: "philosophy",
      stepLabel: null,
      title: p.title,
      text: p.text,
      iconPath: null,
      sortOrder: i + 1,
    });
  });

  content.achievements.forEach((text, i) => {
    rows.push({
      collection: "achievements",
      stepLabel: null,
      // Text-only: the frontend renders these as a plain list.
      title: null,
      text,
      iconPath: null,
      sortOrder: i + 1,
    });
  });

  content.aboutStory.forEach((text, i) => {
    rows.push({
      collection: "about_story",
      stepLabel: null,
      title: null,
      text,
      iconPath: null,
      sortOrder: i + 1,
    });
  });

  return rows;
}

/**
 * Parses the four exported arrays out of the byte-identical copy of
 * `src/content/site-content.ts`.
 *
 * Reading the real module would need a TypeScript loader inside a plain script;
 * the snapshot's own JSON extraction does not include these four, so the
 * literals are parsed from the source copy instead. Either way the values come
 * from the snapshot, never from retyping.
 */
interface ContentFileExports {
  whyChooseUs: Array<{ title: string; icon: string; text: string }>;
  process: Array<{ step: string; title: string; text: string }>;
  achievements: string[];
  aboutStory: string[];
}

let contentFileCache: ContentFileExports | undefined;

export function contentFileExports(): ContentFileExports {
  if (contentFileCache) return contentFileCache;

  const source = readFileSync(
    resolve(SNAPSHOT, "source", "content", "site-content.ts"),
    "utf8",
  );

  contentFileCache = {
    whyChooseUs: evalArrayExport<ContentFileExports["whyChooseUs"]>(source, "whyChooseUs"),
    process: evalArrayExport<ContentFileExports["process"]>(source, "process"),
    achievements: evalArrayExport<string[]>(source, "achievements"),
    aboutStory: evalArrayExport<string[]>(source, "aboutStory"),
  };
  return contentFileCache;
}

/**
 * Extracts `export const <name> = [...]` and evaluates it as a JS literal.
 *
 * The snapshot is a trusted, immutable, committed file — not user input — and
 * the alternative (a full TS parse) would add a dependency for one seed script.
 * Bracket matching is done with a string-aware scanner so an array literal
 * containing `]` inside a quoted string, as the prose does, is handled.
 */
function evalArrayExport<T>(source: string, name: string): T {
  const marker = `export const ${name} = [`;
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`Snapshot site-content.ts has no export named "${name}"`);
  }

  const open = start + marker.length - 1;
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;

  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        const literal = source.slice(open, i + 1);
        return new Function(`"use strict"; return (${literal});`)() as T;
      }
    }
  }

  throw new Error(`Unterminated array literal for "${name}" in snapshot site-content.ts`);
}

// ---------------------------------------------------------------------------
// page_meta — 9 rows
// ---------------------------------------------------------------------------

interface SeoSnapshot {
  global: {
    title: { default: string; template: string };
    description: string;
  };
  perPage: Array<{
    route: string;
    title: string;
    description: string;
    canonical: string;
  }>;
}

export interface PageMetaSeed {
  page: string;
  /** NULL falls back to the site-wide title template — see the privacy row. */
  title: string | null;
  description: string | null;
  canonical: string;
}

/**
 * Route → `page` key. Nine rows, deliberately not eleven:
 *  · `/services/[slug]` is a generated TEMPLATE whose values live in
 *    `services.seo_title` / `seo_description`
 *  · `not-found` exports no metadata at all today
 * Seeding either would create a row with no source.
 */
const ROUTE_TO_PAGE: Record<string, string> = {
  "/": "home",
  "/about": "about",
  "/services": "services",
  "/gallery": "gallery",
  "/videos": "videos",
  "/testimonials": "testimonials",
  "/blog": "blog",
  "/careers": "careers",
  "/contact": "contact",
};

export function pageMetaSeeds(): PageMetaSeed[] {
  const seo = readJson<SeoSnapshot>("seo-metadata.json");

  const fromSnapshot = seo.perPage
    .filter((p) => ROUTE_TO_PAGE[p.route] !== undefined)
    .map((p) => {
      const page = ROUTE_TO_PAGE[p.route];
      if (page === undefined) throw new Error(`Unmapped route ${p.route}`);
      return {
        page,
        title: p.title,
        description: p.description,
        canonical: p.canonical,
      };
    });

  /**
   * E17 — `/privacy` is a NEW page, so the 2fdf32a snapshot has no entry for it.
   *
   * 🔴 Only the canonical URL is seeded. The title and description are left
   * NULL deliberately: `metadataFor()` then falls back to the site-wide title
   * template and default description, which is correct wording nobody had to
   * invent. The clinic can set page-specific SEO text in the admin later.
   */
  const privacy: PageMetaSeed = {
    page: "privacy",
    title: null,
    description: null,
    // A PATH, matching every other row in this table — `metadataFor()` resolves
    // it against the site's `metadataBase`.
    canonical: "/privacy",
  };

  return [...fromSnapshot, privacy];
}

export function seoGlobals(): SeoSnapshot["global"] {
  return readJson<SeoSnapshot>("seo-metadata.json").global;
}

/**
 * `viewport.themeColor` in layout.tsx is `#3d2a1e` while `site.brandColor` is
 * `#44683d`. Two different values exist today; both are preserved rather than
 * reconciled, because reconciling one would change a rendered value.
 */
export const INITIAL_THEME_COLOR = "#3d2a1e";

export { SNAPSHOT as SNAPSHOT_DIR };
