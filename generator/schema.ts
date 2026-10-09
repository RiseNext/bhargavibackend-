/**
 * JSON-LD builders — E18 / logical Phase 13.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ DESTINATION: `frontend/src/lib/schema.ts` in `bhargavi-fronted`.        │
 * │ Here because modifying the frontend needs authorisation not yet given.  │
 * │ Dependency-free, so adopting it is a copy.                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Only the INPUTS become data; the builders stay code-owned (D-026 class). An
 * administrator edits an address, not a schema shape.
 *
 * 🔴 The gating rules are the point of this file. Emitting structured data that
 * overstates what the clinic has is worse than emitting none:
 *
 *  · A per-branch `MedicalClinic` requires **address AND geo** (D-029 / SEO
 *    §3.1). Bowenpally has neither, so it gets no node — rather than a node with
 *    an empty `PostalAddress`, which mismatches the Google Business Profile.
 *  · `JobPosting` is emitted only when `isPlaceholder` is **false** (P-016).
 *    Google penalises markup for listings that are not real vacancies, and all
 *    six current roles are placeholders.
 *  · `FAQPage` answers must be **plain text** — markup there is invalid, which
 *    is why the database rejects HTML in an answer.
 */

export interface SchemaAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface SchemaGeo {
  lat: number;
  lng: number;
}

export interface SchemaHoursWindow {
  open: string;
  close: string;
}

export interface SchemaHoursDay {
  /** 0 = Sunday … 6 = Saturday. */
  day: number;
  windows: readonly SchemaHoursWindow[];
}

export interface SchemaBranch {
  name: string;
  phone: string | null;
  address: SchemaAddress | null;
  geo: SchemaGeo | null;
  hours: readonly SchemaHoursDay[] | null;
  mapsUrl: string | null;
}

export interface SchemaSite {
  url: string;
  name: string;
  description: string | null;
  email: string | null;
  priceRange: string | null;
  logo: string | null;
  ogImage: string | null;
  address: SchemaAddress | null;
  geo: SchemaGeo | null;
  // 🔵 `readonly` throughout: the generated modules are emitted `as const`
  // (R-b), so every array reaching these builders is readonly. Widening the
  // type here is correct and avoids each call site hand-copying the data.
  hoursStructured: readonly SchemaHoursDay[] | null;
  socials: ReadonlyArray<{ href: string }>;
  branches: readonly SchemaBranch[];
  founder: {
    name: string | null;
    honorific: string | null;
    qualifications: string | null;
    role: string | null;
    photo: string | null;
  };
}

/** schema.org day names, indexed by `Date.prototype.getDay()`. */
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Drops null/undefined/empty members so no empty property is emitted. */
function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

const absolute = (siteUrl: string, path: string | null): string | null => {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${siteUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
};

// ---------------------------------------------------------------------------
// Address and hours
// ---------------------------------------------------------------------------

/**
 * `PostalAddress`.
 *
 * Returns undefined unless line1, city and postalCode are all present — the
 * same `hasValue` rule D-029 uses. A partial address in structured data is a
 * Google Business Profile mismatch, which is worse than no address.
 */
export function postalAddress(
  address: SchemaAddress | null,
): Record<string, unknown> | undefined {
  if (!address) return undefined;
  if (!address.line1 || !address.city || !address.postalCode) return undefined;

  return compact({
    "@type": "PostalAddress",
    streetAddress: [address.line1, address.line2].filter(Boolean).join(", "),
    addressLocality: address.city,
    addressRegion: address.state,
    postalCode: address.postalCode,
    addressCountry: address.country ?? "IN",
  });
}

export function geoCoordinates(geo: SchemaGeo | null): Record<string, unknown> | undefined {
  if (!geo) return undefined;
  return { "@type": "GeoCoordinates", latitude: geo.lat, longitude: geo.lng };
}

/**
 * `openingHoursSpecification`.
 *
 * Groups days that share a window set, so seven identical days become one
 * specification rather than seven — which is what the live `layout.tsx` emits
 * today and what validators prefer.
 */
export function openingHours(
  hours: readonly SchemaHoursDay[] | null,
): Array<Record<string, unknown>> | undefined {
  if (!hours || hours.length === 0) return undefined;

  const groups = new Map<string, { days: string[]; windows: readonly SchemaHoursWindow[] }>();

  for (const entry of hours) {
    if (entry.windows.length === 0) continue; // closed days are simply absent
    const key = entry.windows.map((w) => `${w.open}-${w.close}`).join("|");
    const name = DAY_NAMES[entry.day];
    if (!name) continue;

    const existing = groups.get(key);
    if (existing) existing.days.push(name);
    else groups.set(key, { days: [name], windows: entry.windows });
  }

  if (groups.size === 0) return undefined;

  const out: Array<Record<string, unknown>> = [];
  for (const group of groups.values()) {
    for (const window of group.windows) {
      out.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: group.days,
        opens: window.open,
        closes: window.close,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Organization / MedicalClinic
// ---------------------------------------------------------------------------

export function organization(site: SchemaSite): Record<string, unknown> {
  return compact({
    "@type": "Organization",
    "@id": `${site.url}#organization`,
    name: site.name,
    url: site.url,
    description: site.description,
    email: site.email,
    logo: absolute(site.url, site.logo),
    image: absolute(site.url, site.ogImage),
    sameAs: site.socials.map((s) => s.href),
    address: postalAddress(site.address),
  }) as Record<string, unknown>;
}

/**
 * 🔴 A per-branch `MedicalClinic`, GATED on address AND geo.
 *
 * Returns undefined when either is missing. Bowenpally has neither (C-2, C-3),
 * so it legitimately gets no node until the client supplies them — and nothing
 * is invented in the meantime.
 */
export function medicalClinic(
  site: SchemaSite,
  branch: SchemaBranch,
): Record<string, unknown> | undefined {
  const address = postalAddress(branch.address);
  const geo = geoCoordinates(branch.geo);

  // Both, not either. An address with no coordinates still mismatches.
  if (!address || !geo) return undefined;

  return compact({
    "@type": "MedicalClinic",
    "@id": `${site.url}#clinic-${branch.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: `${site.name} — ${branch.name}`,
    parentOrganization: { "@id": `${site.url}#organization` },
    url: site.url,
    telephone: branch.phone,
    priceRange: site.priceRange,
    image: absolute(site.url, site.ogImage),
    address,
    geo,
    hasMap: branch.mapsUrl,
    openingHoursSpecification: openingHours(branch.hours ?? site.hoursStructured),
  }) as Record<string, unknown>;
}

export function person(site: SchemaSite): Record<string, unknown> | undefined {
  if (!site.founder.name) return undefined;

  return compact({
    "@type": "Person",
    "@id": `${site.url}#founder`,
    name: site.founder.name,
    honorificPrefix: site.founder.honorific,
    jobTitle: site.founder.role,
    description: site.founder.qualifications,
    image: absolute(site.url, site.founder.photo),
    worksFor: { "@id": `${site.url}#organization` },
  }) as Record<string, unknown>;
}

/**
 * The site-wide `@graph`.
 *
 * One graph with cross-references rather than several disconnected blocks, so
 * `parentOrganization` and `worksFor` resolve instead of duplicating the
 * organisation into every node.
 */
export function siteGraph(site: SchemaSite): Record<string, unknown> {
  const nodes: Array<Record<string, unknown>> = [organization(site)];

  const founder = person(site);
  if (founder) nodes.push(founder);

  for (const branch of site.branches) {
    const clinic = medicalClinic(site, branch);
    // Gated — a branch with incomplete data contributes nothing.
    if (clinic) nodes.push(clinic);
  }

  return { "@context": "https://schema.org", "@graph": nodes };
}

// ---------------------------------------------------------------------------
// FAQPage
// ---------------------------------------------------------------------------

/**
 * `FAQPage`.
 *
 * ⚠ Answers must be PLAIN TEXT. Any that contain markup are dropped rather than
 * emitted invalid — the database rejects HTML in an answer, so this is a second
 * line of defence for data that predates the constraint.
 */
export function faqPage(
  faqs: Array<{ question: string; answer: string }>,
): Record<string, unknown> | undefined {
  const usable = faqs.filter((f) => !/<[a-zA-Z/!]/.test(f.answer));
  if (usable.length === 0) return undefined;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: usable.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

// ---------------------------------------------------------------------------
// BreadcrumbList
// ---------------------------------------------------------------------------

export interface Crumb {
  name: string;
  /** Absolute or site-relative. The last crumb may omit it. */
  href?: string;
}

/**
 * `BreadcrumbList` — S-3.
 *
 * Seven pages render breadcrumbs today with no markup at all. Trails are
 * route-derived and code-owned (D-026), so only the names come from content.
 */
export function breadcrumbList(
  siteUrl: string,
  crumbs: Crumb[],
): Record<string, unknown> | undefined {
  if (crumbs.length < 2) return undefined; // a single crumb is not a trail

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) =>
      compact({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        // The current page carries no `item`, per Google's guidance.
        item: absolute(siteUrl, crumb.href ?? null),
      }),
    ),
  };
}

// ---------------------------------------------------------------------------
// JobPosting
// ---------------------------------------------------------------------------

export interface SchemaJob {
  slug: string;
  title: string;
  excerpt: string;
  type: string;
  branch: string;
  isPlaceholder: boolean;
  updatedAt: string;
}

/**
 * 🔴 `JobPosting`, GATED on `isPlaceholder === false` (P-016).
 *
 * Google penalises structured data for listings that are not real vacancies,
 * and all six current roles are placeholders — so this returns undefined for
 * every one of them today. That is the correct behaviour, not a bug.
 */
export function jobPosting(
  site: SchemaSite,
  job: SchemaJob,
): Record<string, unknown> | undefined {
  if (job.isPlaceholder) return undefined;

  const address = postalAddress(site.address);

  return compact({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.excerpt,
    datePosted: job.updatedAt,
    employmentType: job.type.toUpperCase().replace("-", "_"),
    hiringOrganization: {
      "@type": "Organization",
      name: site.name,
      sameAs: site.url,
    },
    jobLocation: address
      ? { "@type": "Place", address }
      : // Without a usable address there is no verifiable location; omitting it
        // is better than inventing one.
        undefined,
  }) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// BlogPosting
// ---------------------------------------------------------------------------

export interface SchemaPost {
  slug: string;
  title: string;
  excerpt: string;
  cover: string | null;
  author: string;
  publishedAt: string | null;
  updatedAt: string;
}

export function blogPosting(
  /**
   * 🔵 Only the site URL is used — for the image base, the publisher `@id` and
   * `mainEntityOfPage`. Narrowed deliberately rather than demanding a whole
   * `SchemaSite`: the generated `site` module has no per-branch address, geo or
   * hours, so a caller would have to invent them to satisfy a wider type.
   */
  site: Pick<SchemaSite, "url">,
  post: SchemaPost,
): Record<string, unknown> | undefined {
  // `status + published_at` exists precisely so a post has a stable publication
  // date; without one there is nothing valid to emit.
  if (!post.publishedAt) return undefined;

  return compact({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    image: absolute(site.url, post.cover),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { "@type": "Person", name: post.author },
    publisher: { "@id": `${site.url}#organization` },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${site.url}/blog/${post.slug}`,
    },
  }) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/**
 * Serialises for a `<script type="application/ld+json">` tag.
 *
 * 🔴 Escapes `<`, `>` and `&`. A closing `</script>` inside a JSON string
 * terminates the tag early and turns structured data into an injection point —
 * the one real risk in emitting JSON-LD at all.
 */
export function serialiseJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
