#!/usr/bin/env node
/**
 * 🔴 THE BUILD-TIME CONTENT GENERATOR — D-016, logical Phase 7.5, executes as E10.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ DESTINATION: this file belongs at `frontend/scripts/generate-content.mjs`│
 * │ in the `bhargavi-fronted` repository, run from `prebuild`. It lives here │
 * │ in the backend repo because modifying the frontend requires explicit     │
 * │ authorisation that has not been given. It is a single dependency-free    │
 * │ file precisely so that move is a copy, not a port.                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Content reaches the frontend by BUILD-TIME GENERATION, not runtime fetching.
 * There is no ISR and no `/api/revalidate`; a Vercel Deploy Hook triggers the
 * rebuild. Generated files are COMMITTED, so a build never depends on the API
 * and a rollback is a `git revert`.
 *
 * It writes each content module in its EXISTING exported shape, so every current
 * `import` keeps compiling and **zero component signatures change**.
 *
 * The nine emission rules, and where each lives:
 *   R-a  existing export names and shapes preserved ......... emit* below
 *   R-b  `as const` on `site` ............................... emitSite
 *   R-c  🔴 D-028 dual hours shape .......................... hours.mjs
 *   R-d  🔴 D-029 per-field resolution ...................... server-side, in the API
 *   R-e  `whatsapp` from is_primary ......................... server-side
 *   R-f  D-026 nav re-emitted verbatim ...................... code-owned.mjs
 *   R-g  derived helpers stay code .......................... code-owned.mjs
 *   R-h  `copyStatus` dropped ............................... server-side
 *   R-i  🔴 fail the build rather than emit empty content .... assertUsable
 *
 * Usage:
 *   node scripts/generate-content.mjs              # fetch, verify, write
 *   node scripts/generate-content.mjs --dry-run    # fetch and verify only
 *   node scripts/generate-content.mjs --out DIR    # write somewhere else
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertDisplayHoursUsable,
  toDisplayHours,
  toStructuredExport,
} from "./hours.mjs";
import {
  MAILTO_SUBJECT,
  NAV,
  PENDING_CMS_PROSE,
  SITE_URL_EXPRESSION,
  banner,
} from "./code-owned.mjs";

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 20_000;

export function createFetcher({ baseUrl, apiKey, fetchImpl = fetch }) {
  if (!baseUrl) {
    throw new Error(
      "BACKEND_URL is not set. The generator reads content from the backend API; " +
        "without it the build would silently emit nothing.",
    );
  }

  const base = baseUrl.replace(/\/+$/, "");

  return async function get(path) {
    const url = `${base}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          // Exempts the build from the public GET limit; without it a content
          // deploy throttles itself fetching fifteen endpoints at once.
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`GET ${path} returned ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error(`GET ${path} timed out after ${DEFAULT_TIMEOUT_MS}ms`);
      }
      throw new Error(`GET ${path} failed: ${err?.message ?? String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Pulls every collection the generated modules need. */
export async function fetchContent(get) {
  const [
    settings,
    services,
    testimonials,
    videos,
    gallery,
    faqs,
    jobs,
    contentLists,
    contentBlocks,
    pageMeta,
    posts,
  ] = await Promise.all([
    get("/api/site-settings"),
    get("/api/services"),
    get("/api/testimonials"),
    get("/api/videos"),
    get("/api/gallery"),
    get("/api/faqs"),
    get("/api/jobs"),
    get("/api/content-lists"),
    get("/api/content-blocks"),
    get("/api/page-meta"),
    fetchAllPosts(get),
  ]);

  return {
    settings,
    services: services.items,
    testimonials: testimonials.items,
    videos: videos.items,
    gallery: gallery.items,
    faqs: faqs.items,
    jobs: jobs.items,
    contentLists: contentLists.items,
    contentBlocks: contentBlocks.items,
    pageMeta: pageMeta.items,
    // Already a flat array with blocks attached — see fetchAllPosts.
    posts,
  };
}

/**
 * Every published post, with its content BLOCKS.
 *
 * 🔴 Two defects this replaces.
 *
 * `get("/api/posts?limit=50")` was an unpaginated hard cap: `MAX_LIMIT` is 50,
 * so the 51st published post was silently invisible to the build — the worst
 * kind of failure, because the site looks fine.
 *
 * It also fetched the LIST only, which carries no `blocks`. A detail page built
 * on that data would render a title and an excerpt and nothing else, which
 * looks like a broken site rather than a missing step. The blocks live on
 * `GET /api/posts/{slug}`, so each post needs its own read.
 */
async function fetchAllPosts(get) {
  const PAGE_SIZE = 50;
  const summaries = [];

  for (let page = 1; ; page++) {
    const response = await get(`/api/posts?limit=${String(PAGE_SIZE)}&page=${String(page)}`);
    const items = response.items ?? [];
    summaries.push(...items);

    const total = typeof response.total === "number" ? response.total : summaries.length;
    if (items.length === 0 || summaries.length >= total) break;

    // Defensive: a backend that ignored `page` would otherwise loop forever.
    if (page > 200) {
      throw new Error("Refusing to page through /api/posts more than 200 times");
    }
  }

  // Sequential rather than parallel: a blog is tens of posts, not thousands,
  // and a burst of detail reads against a cold container is a worse trade than
  // a slightly longer build.
  const full = [];
  for (const summary of summaries) {
    const detail = await get(`/api/posts/${encodeURIComponent(summary.slug)}`);
    // The detail read is the authority — it is the only one carrying blocks.
    full.push({ ...summary, ...detail });
  }

  return full;
}

// ---------------------------------------------------------------------------
// R-i — fail the build rather than emit empty or broken content
// ---------------------------------------------------------------------------

/**
 * 🔴 The validations that stop a green build from shipping a broken site.
 *
 * Each one corresponds to a real failure mode recorded in the risk register,
 * not to defensive habit:
 *   · X-25 — a NULL media FK emits an empty `src`, losing the Header, Footer,
 *     Preloader and every OG card image.
 *   · D-029 — address/geo/hours resolving to null empties four surfaces plus the
 *     JSON-LD, silently.
 *   · An empty collection means the API returned nothing and the site would
 *     publish with no services at all.
 */
export function assertUsable(content) {
  const problems = [];
  const { settings } = content;

  if (!settings || typeof settings !== "object") {
    throw new Error("GET /api/site-settings returned no object — cannot generate.");
  }

  // D-029 fail-loud set.
  const missingRequired = settings.resolution?.missingRequired ?? [];
  for (const field of missingRequired) {
    problems.push(
      `site.${field} resolved to null. D-029 resolves it from the first active branch by ` +
        "sort_order holding a value — check that at least one branch has it. Emitting nothing " +
        "would silently empty a live surface.",
    );
  }

  // X-25 brand media.
  for (const field of settings.resolution?.missingMedia ?? []) {
    problems.push(
      `site.${field} is null because its media row is missing. Run seed stage S2 ` +
        "(npm run assets:migrate && npm run seed -- --stage s2). A missing logo with a green " +
        "build is worse than a failed build.",
    );
  }

  // Non-empty collections that the live site demonstrably has.
  //
  // 🔴 GEN-SEO-03. This list covered only the first five. An empty
  // `page_meta`, `content_lists`, `stats`, `gallery` or `content_blocks`
  // response therefore emitted an EMPTY module and exited 0 — the precise
  // silent-green-build failure R-i exists to prevent. The symptom would be a
  // deploy that succeeds while the statistics band, the "why choose us" list,
  // the gallery or every page heading quietly vanishes from the site.
  //
  // ⚠ `posts` is deliberately NOT here: zero blog posts is the real, correct
  // state today (D-036), and requiring one would fail every build until
  // somebody writes an article.
  const required = [
    ["services", content.services, 1],
    ["testimonials", content.testimonials, 1],
    ["videos", content.videos, 1],
    ["faqs", content.faqs, 1],
    ["jobs", content.jobs, 1],
    ["gallery", content.gallery, 1],
    ["content-lists", content.contentLists, 1],
    ["page-meta", content.pageMeta, 1],
    ["content-blocks", content.contentBlocks, 1],
    ["stats", settings.stats, 1],
  ];
  for (const [name, list, minimum] of required) {
    if (!Array.isArray(list) || list.length < minimum) {
      problems.push(`${name} is empty — the live site has content here.`);
    }
  }

  // Identity fields with many consumers.
  //
  // ⚠ Deliberately NOT extended to address / geo / mapsUrl / hours. Those are
  // resolved per field from the first branch by sort_order that HAS a value
  // (D-029), and Bowenpally's are genuinely NULL pending client input — making
  // them required would fail every build on correct data, which is the opposite
  // failure and just as bad.
  for (const field of ["name", "shortName", "email", "priceRange", "tagline", "description"]) {
    if (!settings[field]) problems.push(`site.${field} is missing`);
  }
  if (!settings.whatsapp?.href) {
    problems.push("site.whatsapp.href is missing — the floating WhatsApp button reads it");
  }
  if (!Array.isArray(settings.phones) || settings.phones.length === 0) {
    problems.push("site.phones is empty — 8 occurrences across 5 UI surfaces read phones[0]");
  }

  problems.push(...mediaUrlProblems(content));

  if (problems.length > 0) {
    throw new Error(
      `The generator refuses to emit invalid content:\n  - ${problems.join("\n  - ")}`,
    );
  }
}

/**
 * 🔴 R-i EXTENDED — media URLs must point at the clinic's OWN Cloudinary cloud.
 *
 * THE RELEASE THIS EXISTS TO STOP. Every check above asks "is the content
 * MISSING?". None asked "is it WRONG?". So a build generated from a database
 * seeded by `seed:local-full` emitted 25 URLs on Cloudinary's public `demo`
 * cloud under the synthetic `bhw-local/` prefix, and exited 0. The committed
 * result rendered 125 broken images across all 19 public routes — the header
 * logo and the founder portrait among them — while typecheck, lint, both
 * production builds and the whole test suite stayed green. A present-but-wrong
 * URL is exactly the silent-green-build failure R-i exists to prevent.
 *
 * Deliberately configuration-free: it needs no new environment variable,
 * because the content itself carries enough to judge. Three rules, each one of
 * which alone would have failed that build:
 *
 *   1. `demo` is Cloudinary's shared public sample cloud. It is never a
 *      customer's, so it can only be synthetic or a copy-paste.
 *   2. `bhw-local/` is the prefix `seed-local-full.mts` invents. The real
 *      prefixes are `bhw/dev` and `bhw/prod`.
 *   3. All delivery URLs must share ONE cloud. A mixed set means the media
 *      table was reconciled halfway.
 */
export function mediaUrlProblems(content) {
  const problems = [];

  // JSON does not escape `/`, so delivery URLs appear verbatim.
  const urls = [
    ...JSON.stringify(content).matchAll(/https:\/\/res\.cloudinary\.com\/[^"\\]+/g),
  ].map((m) => m[0]);

  if (urls.length === 0) return problems;

  const cloudOf = (u) => u.split("/")[3] ?? "";
  const clouds = new Set(urls.map(cloudOf));

  if (clouds.has("demo")) {
    const n = urls.filter((u) => cloudOf(u) === "demo").length;
    problems.push(
      `${n} media URL(s) are served from Cloudinary's public "demo" cloud, which is not the ` +
        "clinic's account — every one of them is a broken image on the live site. This is what " +
        "`npm run seed:local-full` writes. Ingest the real manifest instead: " +
        "`npm run assets:migrate` then `npm run seed -- --stage s2`, and regenerate.",
    );
  }

  const synthetic = urls.filter((u) => u.includes("/bhw-local/"));
  if (synthetic.length > 0) {
    problems.push(
      `${synthetic.length} media URL(s) use the synthetic "bhw-local/" prefix, which exists only ` +
        "in the local development seed. Real assets live under bhw/dev or bhw/prod.",
    );
  }

  if (clouds.size > 1) {
    problems.push(
      `media URLs span ${clouds.size} different Cloudinary clouds, so the media table is only ` +
        "partly reconciled. Every image must come from one account.",
    );
  }

  return problems;
}

// ---------------------------------------------------------------------------
// R-i EXTENDED — a production deploy may never silently keep stale content
// ---------------------------------------------------------------------------

/**
 * Whether `prebuild` may legitimately use the COMMITTED content files instead
 * of regenerating from the API.
 *
 * 🔴 THE RELEASE THIS EXISTS TO STOP — and it is the mirror image of every
 * other check in this file. The rest of R-i asks "is the generated content
 * missing or wrong?". This asks "was anything generated AT ALL?".
 *
 * D-016 commits the generated files so that a build never depends on the API
 * being reachable, which makes an unset `BACKEND_URL` a legitimate no-op for a
 * developer building locally and for a CI job with no database. On a Vercel
 * PRODUCTION deployment it is not a no-op: it silently converts the entire
 * publishing pipeline into a rebuild of content committed days earlier. The
 * deploy goes green, Vercel reports success, the editor is told their change is
 * live, and the website does not change. That is indistinguishable — from every
 * surface an operator can see — from the system working.
 *
 * A production build therefore refuses rather than skips. The cost of being
 * wrong in each direction is not symmetric: a failed build is visible and
 * fixable in minutes, while a silently stale deploy is the failure this whole
 * project is built to prevent, and it hides for as long as nobody compares the
 * site to the database.
 *
 * `VERCEL_ENV` is Vercel's own marker (`production` | `preview` |
 * `development`), set by the platform and not by us, so this needs no new
 * configuration to work. Previews are deliberately exempt: a preview of a
 * frontend-only change is a normal thing to build without content credentials.
 */
export function generationSkipDecision(source = process.env) {
  if (source.BACKEND_URL) return { skip: false, refuse: false };

  if (source.VERCEL_ENV === "production") {
    return {
      skip: false,
      refuse: true,
      reason:
        "BACKEND_URL is not set, but this is a Vercel PRODUCTION build.\n\n" +
        "  Skipping generation here would rebuild the site from the content files committed in\n" +
        "  git and report success, so every change made in the admin panel since those files\n" +
        "  were last regenerated would stay invisible on the live website — with a green\n" +
        "  deployment and no error anywhere. That is the exact silent failure D-016's generator\n" +
        "  is built to prevent, so the build stops instead.\n\n" +
        "  Set BACKEND_URL (and BACKEND_API_KEY) on the Vercel project's Production\n" +
        "  environment. To build without refreshing content on purpose, do it from a preview\n" +
        "  deployment rather than production.",
    };
  }

  return {
    skip: true,
    refuse: false,
    reason:
      "Content generation skipped: BACKEND_URL is not set.\n" +
      "  Using the committed content files, which is the intended behaviour for a\n" +
      "  build that is not refreshing content (D-016).",
  };
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/**
 * Emits a JS literal with stable, readable formatting.
 *
 * `JSON.stringify` is the right tool here: it escapes correctly, and the values
 * are plain data. Keys are emitted unquoted where they are valid identifiers so
 * the output reads like the hand-written original.
 */
function literal(value, indent = 0) {
  const pad = "  ".repeat(indent);
  const padInner = "  ".repeat(indent + 1);

  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const entries = value.map((v) => `${padInner}${literal(v, indent + 1)}`);
    return `[\n${entries.join(",\n")},\n${pad}]`;
  }

  const keys = Object.keys(value).filter((k) => value[k] !== undefined);
  if (keys.length === 0) return "{}";

  const entries = keys.map((k) => {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
    return `${padInner}${key}: ${literal(value[k], indent + 1)}`;
  });
  return `{\n${entries.join(",\n")},\n${pad}}`;
}

/** Strips keys the frontend's types do not have, so the emitted shape is exact. */
function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) out[key] = source[key];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

/** `src/lib/site.ts` — the `site` object plus the code-owned nav (D-026). */
export function emitSite(content) {
  const s = content.settings;

  // R-c / D-028: transform to the display shape the three live consumers read,
  // and emit the structured model additively.
  const displayHours = toDisplayHours(s.hours);
  assertDisplayHoursUsable(displayHours);
  const structuredHours = toStructuredExport(s.hours);

  const site = {
    name: s.name,
    shortName: s.shortName,
    tagline: s.tagline,
    description: s.description,
    // Placeholder swapped for the raw expression after serialisation, because
    // this value must stay env-overridable rather than baked in.
    url: "__SITE_URL__",
    locale: s.locale,
    founder: {
      name: s.founder.name,
      honorific: s.founder.honorific,
      qualifications: s.founder.qualifications,
      role: s.founder.role,
      photo: s.founder.photo,
    },
    phones: s.phones.map((p) => pick(p, ["label", "href", "branch"])),
    // 🔴 D-013: `branches` is ordered by sort_order and `phones` by
    // phone_sort_order. The arrays are exact reverses in the live site, and the
    // API has already applied both orderings — the generator must not re-sort.
    branches: s.branches.map((b) => ({
      name: b.name,
      phone: b.phone,
      whatsapp: b.whatsapp,
    })),
    whatsapp: { number: s.whatsapp.number, href: s.whatsapp.href },
    email: s.email,
    address: pick(s.address, [
      "line1",
      "line2",
      "city",
      "state",
      "postalCode",
      "country",
      "full",
    ]),
    geo: { lat: s.geo.lat, lng: s.geo.lng },
    mapsUrl: s.mapsUrl,
    mapEmbedSrc: s.mapEmbedSrc,
    priceRange: s.priceRange,
    hours: displayHours,
    socials: s.socials.map((x) => ({ name: x.name, href: x.href })),
    logo: s.logo,
    logoLockup: s.logoLockup,
    brandColor: s.brandColor,
    ogImage: s.ogImage,
  };

  const serialised = literal(site)
    // Replace the quoted placeholder with the bare expression.
    .replace('"__SITE_URL__"', SITE_URL_EXPRESSION);

  return `${banner("GET /api/site-settings")}export const site = ${serialised} as const;

/** ✅ D-028 — additive. Consumed by OpenStatus and the JSON-LD builder. */
export const hoursStructured = ${literal(structuredHours)} as const;

/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 D-026 — NAVIGATION IS CODE-OWNED.
 *
 * Re-emitted verbatim, not sourced from the CMS. \`Header.tsx\` imports \`nav\`,
 * \`NavItem\` and \`NavChild\`; losing any of them is a dead deployment. Editable
 * navigation was never requested and risks a non-technical admin breaking the
 * site's information architecture.
 * ──────────────────────────────────────────────────────────────────────────── */

export type NavChild = { label: string; href: string; hint?: string };

export type NavItem = {
  label: string;
  href: string;
  children?: NavChild[];
};

export const nav: NavItem[] = ${literal(NAV)};
`;
}

/** `src/content/services.ts` */
export function emitServices(content) {
  const services = content.services.map((s) => {
    const row = {
      slug: s.slug,
      title: s.title,
      excerpt: s.excerpt,
      image: s.image,
      duration: s.duration,
      treats: s.treats,
      body: s.body,
      // 🔴 SEO-01 — kept so `sitemap.xml` can stamp a REAL lastModified per
      // service page instead of the build time. CLAUDE.md §8 calls the old
      // `new Date()` "meaningless", and it was: every page claimed to change on
      // every deploy, which devalues the signal for the pages that really did.
      updatedAt: s.updatedAt,
    };
    // F-7: these were hardcoded JSX on the detail page and are now real fields.
    // Omitted entirely when null, so the UI's hide-when-absent path still works.
    if (s.priceFromPaise !== null) row.priceFrom = formatRupees(s.priceFromPaise);
    if (s.typicalCourse !== null) row.typicalCourse = s.typicalCourse;
    return row;
  });

  return `${banner("GET /api/services")}export type Service = {
  /** Real updated_at from the database — used by sitemap.xml (SEO-01). */
  updatedAt: string;
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  duration: string;
  treats: string[];
  body: string[];
  /** Display string, e.g. "From ₹100". Absent when no price is set. */
  priceFrom?: string;
  /** Display string, e.g. "2–4 sittings". Absent when unknown. */
  typicalCourse?: string;
};

export const services: Service[] = ${literal(services)};

/** Derived helper — code-owned (R-g). */
export const serviceBySlug = (slug: string) => services.find((s) => s.slug === slug);

/**
 * ✅ D-037 — the service hero's alt text, DERIVED rather than stored.
 *
 * \`services/[slug]/page.tsx:112\` renders this exact string today. It has no
 * authored value of its own, so it is a helper rather than a content field —
 * and emitting it here keeps the rendered markup byte-identical.
 */
export const serviceHeroAlt = (service: Service) =>
  \`\${service.title} at \${${JSON.stringify(content.settings.name)}}\`;
`;
}

/**
 * Paise → the display string the service page shows.
 *
 * ₹100 renders as "From ₹100", with no decimals for a whole-rupee amount —
 * matching the hardcoded JSX it replaces.
 */
export function formatRupees(paise) {
  const rupees = paise / 100;
  const amount = Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
  return `From ₹${amount}`;
}

/** `src/content/testimonials.ts` */
export function emitTestimonials(content) {
  const testimonials = content.testimonials.map((t) => {
    const row = { name: t.name, quote: t.quote };
    // `when` is the preserved free text; absent where no value exists, rather
    // than an invented date.
    if (t.when) row.when = t.when;
    if (t.featured) row.featured = true;
    return row;
  });

  return `${banner("GET /api/testimonials")}export type Testimonial = {
  name: string;
  quote: string;
  when?: string;
  featured?: boolean;
};

export const testimonials: Testimonial[] = ${literal(testimonials)};

/** Derived helper — code-owned (R-g). */
export const featuredTestimonials = testimonials.filter((t) => t.featured);
`;
}

/** `src/content/media.ts` — videos plus the gallery. */
export function emitMedia(content) {
  const videos = content.videos.map((v) => {
    const row = { id: v.id, title: v.title };
    if (v.translation) row.translation = v.translation;
    if (v.featured) row.featured = true;
    return row;
  });

  const gallery = content.gallery.map((g) => ({ src: g.src, alt: g.alt }));

  return `${banner("GET /api/videos and GET /api/gallery")}export type Video = {
  id: string;
  title: string;
  translation?: string;
  featured?: boolean;
};

export const videos: Video[] = ${literal(videos)};

/** Derived helpers — code-owned (R-g). Thumb and embed URLs are never stored. */
export const featuredVideos = videos.filter((v) => v.featured);

export const youtubeThumb = (id: string) =>
  \`https://i.ytimg.com/vi/\${id}/hqdefault.jpg\`;

export const youtubeWatch = (id: string) =>
  \`https://www.youtube.com/watch?v=\${id}\`;

export const galleryImages = ${literal(gallery)};
`;
}

/** `src/content/careers.ts` */
export function emitCareers(content) {
  const jobs = content.jobs.map((j) => ({
    slug: j.slug,
    title: j.title,
    type: j.type,
    // D-015: already the derived display string — "Either branch" or the name.
    branch: j.branch,
    experience: j.experience,
    excerpt: j.excerpt,
    responsibilities: j.responsibilities,
    requirements: j.requirements,
  }));

  return `${banner("GET /api/jobs")}export type Job = {
  /** Reserved for a future /careers/[slug] detail page. */
  slug: string;
  title: string;
  type: string;
  branch: string;
  experience: string;
  excerpt: string;
  responsibilities: string[];
  requirements: string[];
};

export const jobs: Job[] = ${literal(jobs)};

/** Derived helper — code-owned (R-g). */
export const jobBySlug = (slug: string) => jobs.find((j) => j.slug === slug);

/* ─────────────────────────────────────────────────────────────────────────────
 * ✅ D-037 — the mailto subject is CODE-OWNED chrome, not CMS content.
 *
 * It is an \`encodeURIComponent\`-wrapped query parameter, never rendered as
 * visible copy, in the same class as \`site.whatsapp.href\`. The editable
 * sentence the visitor actually reads — "with the role in the subject line" —
 * is \`careers.apply.extra.resumeInstruction\`.
 *
 * ⚠ X-34 is an open DEFECT here: the subject omits the role. Fixing it is a
 * one-line change to this constant plus the modal path.
 * ──────────────────────────────────────────────────────────────────────────── */

export const mailtoSubject = ${literal(MAILTO_SUBJECT)};
`;
}

/** `src/content/site-content.ts` — stats, the list collections, FAQs. */
export function emitSiteContent(content) {
  const byCollection = (name) =>
    content.contentLists.filter((c) => c.collection === name);

  const stats = content.settings.stats.map((s) => {
    const row = { value: s.value, suffix: s.suffix, label: s.label };
    // ✅ D-023 — the hero renders the SAME stats with DIFFERENT wording.
    // Emitted only where it differs, so `heroLabel ?? label` stays meaningful.
    if (s.heroLabel) row.heroLabel = s.heroLabel;
    if (s.showInHero) row.showInHero = true;
    return row;
  });

  const whyChooseUs = byCollection("why_choose_us").map((c) => ({
    title: c.title,
    icon: c.icon,
    text: c.text,
  }));

  const process = byCollection("process").map((c) => ({
    step: c.step,
    title: c.title,
    text: c.text,
  }));

  const philosophy = byCollection("philosophy").map((c) => ({
    title: c.title,
    text: c.text,
  }));

  const aboutStory = byCollection("about_story").map((c) => c.text);
  const achievements = byCollection("achievements").map((c) => c.text);

  const faqs = content.faqs.map((f) => ({ question: f.question, answer: f.answer }));

  return `${banner("GET /api/site-settings (stats), /api/content-lists and /api/faqs")}export type Stat = {
  value: number;
  suffix: string;
  label: string;
  /** ✅ D-023 — the hero's own wording. Resolution rule: \`heroLabel ?? label\`. */
  heroLabel?: string;
  showInHero?: boolean;
};

export const stats: Stat[] = ${literal(stats)};

export const whyChooseUs = ${literal(whyChooseUs)};

export const process = ${literal(process)};

/** ⚠ Previously hardcoded inside about/page.tsx:26-39, not a content file. */
export const philosophy = ${literal(philosophy)};

export const aboutStory = ${literal(aboutStory)};

export const achievements = ${literal(achievements)};

export type Faq = { question: string; answer: string };

export const faqs: Faq[] = ${literal(faqs)};

/* ─────────────────────────────────────────────────────────────────────────────
 * Prose still awaiting its CMS home — re-emitted verbatim.
 *
 * \`homeIntro\` belongs in \`content_blocks\` (\`home.intro\`), which seeds in stage
 * S3 behind gate 0.12. \`treatmentsIntro\` is dead code — exported but rendered
 * on no page — so it is preserved rather than seeded (R-20).
 *
 * Preserving them keeps the site byte-identical in the meantime, which is
 * exactly what D-011 requires.
 * ──────────────────────────────────────────────────────────────────────────── */

export const homeIntro = ${literal(PENDING_CMS_PROSE.homeIntro)};

export const treatmentsIntro = ${literal(PENDING_CMS_PROSE.treatmentsIntro)};
`;
}

/** `src/content/posts.ts` — new, and empty until the first post is published. */
export function emitPosts(content) {
  // 🔴 `updatedAt`, `seoTitle`, `seoDescription` and `blocks` were all dropped.
  // `blogPosting()` needs `updatedAt` for `dateModified` — substituting
  // `publishedAt` would emit a FALSE modification date, and `new Date()` is the
  // meaningless stamp CLAUDE.md §8 calls out by name. Without `blocks` a detail
  // page has nothing to render.
  const posts = content.posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    cover: p.cover,
    author: p.author,
    tags: p.tags,
    publishedAt: p.publishedAt,
    readingMinutes: p.readingMinutes,
    updatedAt: p.updatedAt,
    seoTitle: p.seoTitle ?? null,
    seoDescription: p.seoDescription ?? null,
    blocks: p.blocks ?? [],
  }));

  return `${banner("GET /api/posts and GET /api/posts/{slug}")}/**
 * One block of a post's body.
 *
 * Six types, not three: \`text\`, \`heading\`, \`image\`, \`youtube\`, \`quote\`, \`list\`.
 *
 * 🔴 \`textHtml\` is sanitised ON WRITE (an allowlist of
 * \`p,strong,em,u,a,ul,ol,li,br\`), asserted against the stored rows, and is
 * deliberately NOT re-sanitised on read. Every other field is plain text, and
 * \`youtubeId\` is an 11-character id.
 */
export type PostBlock = {
  type: "text" | "heading" | "image" | "youtube" | "quote" | "list";
  textHtml: string | null;
  headingLevel: number | null;
  headingText: string | null;
  image: string | null;
  imageAlt: string | null;
  imageCaption: string | null;
  youtubeId: string | null;
  youtubeTitle: string | null;
  listItems: string[] | null;
};

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  cover: string | null;
  author: string;
  tags: string[];
  publishedAt: string | null;
  readingMinutes: number | null;
  /** Real timestamp from the row — \`dateModified\` in BlogPosting JSON-LD. */
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  blocks: PostBlock[];
};

export const posts: Post[] = ${literal(posts)};

/** Derived helper — code-owned (R-g). */
export const postBySlug = (slug: string) => posts.find((p) => p.slug === slug);
`;
}

/** `src/content/page-meta.ts` — per-page SEO, consumed by generateMetadata. */
export function emitPageMeta(content) {
  const entries = {};
  for (const m of content.pageMeta) {
    entries[m.page] = pick(m, ["title", "description", "canonical", "ogImage"]);
    if (m.noindex) entries[m.page].noindex = true;
  }

  /**
   * 🔴 SEO-01 — the newest `updatedAt` across every collection the generator
   * fetched, for the static sitemap routes.
   *
   * Those pages have no single owning row: `/about` draws on content_blocks,
   * site_settings and the founder's details at once. A site-wide maximum is the
   * honest answer — "some content behind this page changed then" — and is a
   * strict improvement on the build timestamp, which changed on every deploy
   * whether anything had been edited or not.
   *
   * Computed from payloads already in hand, so no new API route and no second
   * source of truth. Mirrors `latestContentChange()`, which the API uses for
   * its collection ETag.
   */
  const stamps = [];
  for (const key of [
    "services", "testimonials", "videos", "gallery", "faqs", "jobs",
    "contentLists", "contentBlocks", "pageMeta", "posts",
  ]) {
    for (const row of content[key] ?? []) {
      if (typeof row?.updatedAt === "string") stamps.push(row.updatedAt);
    }
  }
  if (typeof content.settings?.updatedAt === "string") stamps.push(content.settings.updatedAt);
  stamps.sort();
  const contentUpdatedAt = stamps.at(-1);
  if (contentUpdatedAt === undefined) {
    // R-i: fail the build rather than emit a timestamp nobody can trust.
    throw new Error(
      "emitPageMeta: no updatedAt found on any collection — cannot stamp the sitemap.",
    );
  }

  return `${banner("GET /api/page-meta")}export type PageMetaEntry = {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  noindex?: boolean;
};

export const pageMeta: Record<string, PageMetaEntry> = ${literal(entries)};

/** Derived helper — code-owned (R-g). */
export const metaForPage = (page: string): PageMetaEntry => pageMeta[page] ?? {};

/** 🔴 SEO-01 — newest content change, for sitemap.xml's static routes. */
export const contentUpdatedAt = ${literal(contentUpdatedAt)};
`;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * `src/content/page-copy.ts` — ✅ D-037 / E15.
 *
 * The 41 `content_blocks` rows, keyed `page.slot`, with their repeating `items`
 * groups. Every page's hero and section copy comes from here.
 *
 * Titles may carry the `*marker*` emphasis convention (D-037, closing B6). The
 * frontend parses it with `lib/emphasis.tsx` into exactly
 * `<span className="italic">` and escapes everything else, so it introduces no
 * second markup path alongside blog blocks.
 */
/** The exact marker `src/lib/content/privacy.ts` scans for (D-021). */
const UNKNOWN_MARKER = "UNKNOWN — CLIENT INPUT REQUIRED";

/**
 * 🔴 THE PRIVACY PUBLICATION GATE — the one place it is enforced.
 *
 * `privacyReadiness()` could always compute this, but nothing called it, so the
 * policy could have been published with unresolved legal facts in it. The gate
 * belongs HERE because the site is built from these generated files: a page
 * that is never emitted cannot be rendered, cannot be linked and cannot be
 * indexed, whatever a later component does.
 *
 * Returns the slots that still carry a marker. Non-empty ⇒ the whole privacy
 * page is withheld — not the offending slots only. Publishing eleven correct
 * sections and silently dropping the retention period would read as a complete
 * policy while being materially misleading.
 */
function privacySlotsWithMarkers(contentBlocks) {
  const offending = [];

  for (const block of contentBlocks ?? []) {
    if (block.page !== "privacy") continue;

    const haystack = [
      block.label ?? "",
      block.title ?? "",
      block.lead ?? "",
      ...(block.body ?? []),
      block.extra === null || block.extra === undefined ? "" : JSON.stringify(block.extra),
    ].join("\n");

    if (haystack.includes(UNKNOWN_MARKER)) offending.push(block.slot);
  }

  return offending;
}

export function emitPageCopy(content) {
  const blocks = {};

  const withheld = privacySlotsWithMarkers(content.contentBlocks);
  const privacyPublished = withheld.length === 0 &&
    (content.contentBlocks ?? []).some((b) => b.page === "privacy");

  if (withheld.length > 0) {
    // Loud, because silence here is the failure mode: an operator must be able
    // to see WHY /privacy is still a 404 after they edited it.
    process.stderr.write(
      `  ⚠ privacy policy WITHHELD — ${String(withheld.length)} slot(s) still contain ` +
        `"${UNKNOWN_MARKER}": ${withheld.join(", ")}\n` +
        "    /privacy will render as not-found until the client supplies those facts.\n",
    );
  }

  for (const block of content.contentBlocks ?? []) {
    // 🔴 Withhold the entire privacy page while any fact is unresolved.
    if (block.page === "privacy" && withheld.length > 0) continue;

    const key = `${block.page}.${block.slot}`;

    const entry = {};
    if (block.label !== null) entry.label = block.label;
    if (block.title !== null) entry.title = block.title;
    if (block.lead !== null) entry.lead = block.lead;
    if (block.body !== null) entry.body = block.body;
    if (block.cta !== null) entry.cta = block.cta;
    if (block.cta2 !== null) entry.cta2 = block.cta2;
    // A destination with a code-owned label (migration 013). The component
    // renders the label from an expression and takes the href from here.
    if (block.ctaHref != null) entry.ctaHref = block.ctaHref;
    if (block.cta2Href != null) entry.cta2Href = block.cta2Href;
    if (block.extra !== null) entry.extra = block.extra;

    if (block.items.length > 0) {
      // Grouped by `groupKey`, which is how the components consume them.
      const groups = {};
      for (const item of block.items) {
        groups[item.groupKey] ??= [];
        const row = {};
        for (const field of ["label", "value", "text", "href", "iconKey", "image", "alt", "lines"]) {
          if (item[field] !== null && item[field] !== undefined) row[field] = item[field];
        }
        groups[item.groupKey].push(row);
      }
      entry.items = groups;
    }

    blocks[key] = entry;
  }

  return `${banner("GET /api/content-blocks")}export type PageCopyLink = { label: string; href: string };

export type PageCopyItem = {
  label?: string;
  value?: string;
  text?: string;
  href?: string;
  iconKey?: string;
  image?: string;
  alt?: string;
  lines?: string[];
};

export type PageCopyBlock = {
  label?: string;
  /** May contain \`*emphasis*\` markers — render with \`lib/emphasis.tsx\`. */
  title?: string;
  lead?: string;
  body?: string[];
  cta?: PageCopyLink;
  cta2?: PageCopyLink;
  /** A destination whose label the component supplies from code (D-040). */
  ctaHref?: string;
  cta2Href?: string;
  extra?: Record<string, unknown>;
  items?: Record<string, PageCopyItem[]>;
};

export const pageCopy: Record<string, PageCopyBlock> = ${literal(blocks)};

/**
 * Derived helper — code-owned (R-g).
 *
 * Returns an empty block rather than throwing, so an unmapped slot renders
 * nothing instead of breaking the page. The generator's own validation is what
 * catches a missing slot, at build time.
 */
export const copyFor = (page: string, slot: string): PageCopyBlock =>
  pageCopy[\`\${page}.\${slot}\`] ?? {};

/**
 * 🔴 Whether the privacy policy may be shown (D-021).
 *
 * \`false\` while any slot still contains an unresolved
 * \`UNKNOWN — CLIENT INPUT REQUIRED\` fact, in which case the privacy slots are
 * absent from \`pageCopy\` entirely and \`/privacy\` must answer not-found. The
 * footer link and the sitemap entry are gated on this too, so an unapproved
 * policy is never advertised.
 */
export const privacyPublished = ${String(privacyPublished)};
`;
}

export function generateAll(content) {
  assertUsable(content);

  return {
    "src/lib/site.ts": emitSite(content),
    "src/content/services.ts": emitServices(content),
    "src/content/testimonials.ts": emitTestimonials(content),
    "src/content/media.ts": emitMedia(content),
    "src/content/careers.ts": emitCareers(content),
    "src/content/site-content.ts": emitSiteContent(content),
    "src/content/posts.ts": emitPosts(content),
    "src/content/page-meta.ts": emitPageMeta(content),
    "src/content/page-copy.ts": emitPageCopy(content),
  };
}

export function writeFiles(files, outDir) {
  for (const [relative, source] of Object.entries(files)) {
    const target = resolve(outDir, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source, "utf8");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const outIndex = args.indexOf("--out");
  const outDir = outIndex >= 0 ? args[outIndex + 1] : process.cwd();

  // 🔴 D-016: generated files are COMMITTED, so "a build never depends on the
  // API being reachable". Running from `prebuild` therefore has to be a no-op
  // when no backend is configured — a developer building locally, or a CI job
  // with no database, must not be blocked. The committed files are used as-is.
  //
  // This is NOT a silent fallback for a broken backend: if BACKEND_URL IS set
  // and the API fails, the build stops (R-i). And on a Vercel PRODUCTION build
  // the skip itself is refused, because there it would publish stale content
  // under a green deploy — see generationSkipDecision.
  const decision = generationSkipDecision(process.env);
  if (decision.refuse) throw new Error(decision.reason);
  if (decision.skip) {
    process.stdout.write(`${decision.reason}\n`);
    return;
  }

  const get = createFetcher({
    baseUrl: process.env.BACKEND_URL,
    apiKey: process.env.BACKEND_API_KEY,
  });

  process.stdout.write("Generating content from the backend API …\n");

  const content = await fetchContent(get);
  const files = generateAll(content);

  process.stdout.write(
    `  services ${content.services.length} · testimonials ${content.testimonials.length} · ` +
      `videos ${content.videos.length} · gallery ${content.gallery.length} · ` +
      `faqs ${content.faqs.length} · jobs ${content.jobs.length} · posts ${content.posts.length}\n`,
  );

  if (dryRun) {
    process.stdout.write("\n--dry-run: validated, nothing written.\n");
    return;
  }

  writeFiles(files, outDir);
  for (const name of Object.keys(files)) process.stdout.write(`  wrote ${name}\n`);
  process.stdout.write("\nContent generated. Commit the result (D-016).\n");
}

/**
 * Only run when invoked directly, so the module can be imported by tests.
 *
 * 🔴 Uses `pathToFileURL` rather than string-building the URL. A hand-rolled
 * `file://${path}` produces `file://C:/…` on Windows while `import.meta.url` is
 * `file:///C:/…` — the comparison then always fails, `main()` never runs, and
 * the generator exits 0 having done nothing. That is the exact silent-failure
 * mode this project exists to avoid: `prebuild` would appear to succeed on
 * every build while never generating any content.
 */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`\n🔴 Content generation FAILED.\n\n${err.message}\n\n`);
    process.stderr.write(
      "The build is stopped deliberately: emitting empty or partial content would publish a\n" +
        "broken site with a green build (R-i).\n",
    );
    process.exitCode = 1;
  });
}
