/**
 * The seven admin content collections — E14.
 *
 * Each definition is deliberately just a field allowlist plus its invariants.
 * Everything cross-cutting — both auth gates, CSRF, audit, the deploy hook,
 * soft delete, slug immutability — lives in `crud.ts` and is therefore
 * impossible to forget for one collection.
 *
 * Notes that are decisions rather than preferences:
 *  · `rating` is accepted on testimonials but the five stars are NEVER driven
 *    from it (X-22) — doing so would strip them from all 23 cards.
 *  · `copy_status` is editorial and never leaves the admin.
 *  · FAQ answers reject HTML, because they are serialised into FAQPage JSON-LD.
 *  · `is_placeholder` gates JobPosting markup; Google penalises markup for
 *    listings that are not real vacancies.
 */

import { z } from "zod";
import { queryOne } from "../db";
import { createAdminCrud, type AdminCrudHandlers } from "./crud";

/** Trimmed, non-empty, capped. The caps match API design §2.3. */
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullish();
const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lower-case words separated by hyphens")
  .max(120);
const stringArray = (max: number) => z.array(z.string().trim().min(1).max(2000)).max(max);

/** Drops keys the caller did not send, so a PATCH only writes what it names. */
function present<T extends Record<string, unknown>>(
  input: T,
  map: Partial<Record<keyof T, string>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(map) as Array<[keyof T, string]>) {
    if (input[key] !== undefined) out[column] = input[key];
  }
  return out;
}

const jsonb = (value: unknown): string => JSON.stringify(value);

// ---------------------------------------------------------------------------
// services
// ---------------------------------------------------------------------------

const serviceFields = {
  slug,
  title: text(200),
  excerpt: text(500),
  duration: text(80),
  /** Integer paise, never a float. ₹100 = 10000. */
  priceFromPaise: z.number().int().min(0).max(100_000_000).nullish(),
  typicalCourse: optionalText(120),
  body: stringArray(60),
  treats: stringArray(60),
  imageMediaId: z.string().uuid().nullish(),
  copyStatus: z.enum(["source", "rewrite"]).nullish(),
  seoTitle: optionalText(200),
  seoDescription: optionalText(400),
  ogMediaId: z.string().uuid().nullish(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  published: z.boolean().optional(),
};

const SERVICE_COLUMNS = `
  id::text AS id, slug, title, excerpt, duration, price_from_paise, typical_course,
  body, treats, image_media_id::text AS image_media_id, copy_status::text AS copy_status,
  seo_title, seo_description, og_media_id::text AS og_media_id,
  sort_order, published, created_at, updated_at, deleted_at`;

const serviceMap = {
  slug: "slug",
  title: "title",
  excerpt: "excerpt",
  duration: "duration",
  priceFromPaise: "price_from_paise",
  typicalCourse: "typical_course",
  imageMediaId: "image_media_id",
  copyStatus: "copy_status",
  seoTitle: "seo_title",
  seoDescription: "seo_description",
  ogMediaId: "og_media_id",
  sortOrder: "sort_order",
  published: "published",
} as const;

export const servicesCrud: AdminCrudHandlers = createAdminCrud({
  name: "services",
  table: "services",
  label: "service",
  columns: SERVICE_COLUMNS,
  softDelete: true,
  publishMode: "boolean",
  reorderable: true,
  slugColumn: "slug",
  createSchema: z.object(serviceFields).strict(),
  updateSchema: z.object(serviceFields).partial().strict(),
  toInsert: (input) => ({
    ...present(input, serviceMap),
    body: jsonb(input.body),
    treats: jsonb(input.treats),
  }),
  toUpdate: (input) => ({
    ...present(input, serviceMap),
    ...(input.body !== undefined ? { body: jsonb(input.body) } : {}),
    ...(input.treats !== undefined ? { treats: jsonb(input.treats) } : {}),
  }),
});

// ---------------------------------------------------------------------------
// testimonials
// ---------------------------------------------------------------------------

const testimonialFields = {
  authorName: text(200),
  quote: text(4000),
  /** A real date where known. Never invented — 17 of 23 rows have none. */
  givenOn: z.string().date().nullish(),
  /** The original free text, preserved where no date exists. */
  whenLabel: optionalText(80),
  /** ⚠ X-22 — data only. The five stars are hardcoded and must stay so. */
  rating: z.number().int().min(1).max(5).nullish(),
  source: z.enum(["google", "direct", "other"]).nullish(),
  sourceUrl: optionalText(500),
  practitionerLabel: optionalText(120),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  published: z.boolean().optional(),
};

const testimonialMap = {
  authorName: "author_name",
  quote: "quote",
  givenOn: "given_on",
  whenLabel: "when_label",
  rating: "rating",
  source: "source",
  sourceUrl: "source_url",
  practitionerLabel: "practitioner_label",
  featured: "featured",
  sortOrder: "sort_order",
  published: "published",
} as const;

export const testimonialsCrud: AdminCrudHandlers = createAdminCrud({
  name: "testimonials",
  table: "testimonials",
  label: "testimonial",
  columns: `
    id::text AS id, author_name, quote, given_on, when_label, rating,
    source::text AS source, source_url, practitioner_label,
    featured, sort_order, published, created_at, updated_at, deleted_at`,
  softDelete: true,
  publishMode: "boolean",
  reorderable: true,
  createSchema: z.object(testimonialFields).strict(),
  updateSchema: z.object(testimonialFields).partial().strict(),
  toInsert: (input) => present(input, testimonialMap),
  toUpdate: (input) => present(input, testimonialMap),
});

// ---------------------------------------------------------------------------
// videos
// ---------------------------------------------------------------------------

const videoFields = {
  /** Exactly 11 characters — never a URL, never iframe markup. */
  youtubeId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{11}$/, "must be an 11-character YouTube id, not a URL"),
  title: text(300),
  translation: optionalText(300),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  published: z.boolean().optional(),
};

const videoMap = {
  youtubeId: "youtube_id",
  title: "title",
  translation: "translation",
  featured: "featured",
  sortOrder: "sort_order",
  published: "published",
} as const;

export const videosCrud: AdminCrudHandlers = createAdminCrud({
  name: "videos",
  table: "videos",
  label: "video",
  columns: `
    id::text AS id, youtube_id, title, translation, featured,
    sort_order, published, created_at, updated_at, deleted_at`,
  softDelete: true,
  publishMode: "boolean",
  reorderable: true,
  createSchema: z.object(videoFields).strict(),
  updateSchema: z.object(videoFields).partial().strict(),
  toInsert: (input) => present(input, videoMap),
  toUpdate: (input) => present(input, videoMap),
});

// ---------------------------------------------------------------------------
// gallery
// ---------------------------------------------------------------------------

const galleryFields = {
  /** 🔴 NOT NULL (D-032). A gallery row without an image is meaningless. */
  mediaId: z.string().uuid(),
  /** Required — a gallery tile with no alt text is an accessibility defect. */
  alt: text(300),
  caption: optionalText(300),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  published: z.boolean().optional(),
};

const galleryMap = {
  mediaId: "media_id",
  alt: "alt",
  caption: "caption",
  sortOrder: "sort_order",
  published: "published",
} as const;

export const galleryCrud: AdminCrudHandlers = createAdminCrud({
  name: "gallery",
  table: "gallery_images",
  label: "gallery image",
  columns: `
    id::text AS id, media_id::text AS media_id, alt, caption,
    sort_order, published, created_at, updated_at, deleted_at`,
  softDelete: true,
  publishMode: "boolean",
  reorderable: true,
  createSchema: z.object(galleryFields).strict(),
  updateSchema: z.object(galleryFields).partial().strict(),
  toInsert: (input) => present(input, galleryMap),
  toUpdate: (input) => present(input, galleryMap),
  validate: async (input) => {
    const mediaId = input.media_id;
    if (typeof mediaId !== "string") return [];

    const media = await queryOne<{ visibility: string; resource_type: string }>(
      "SELECT visibility::text AS visibility, resource_type::text AS resource_type FROM media WHERE id = $1 AND deleted_at IS NULL",
      [mediaId],
    );

    if (!media) return ["That image does not exist in the media library."];
    // A private resume must never become a public gallery tile.
    if (media.visibility !== "public") {
      return ["That file is private and cannot be used in the public gallery."];
    }
    if (media.resource_type !== "image") return ["That file is not an image."];
    return [];
  },
});

// ---------------------------------------------------------------------------
// faqs
// ---------------------------------------------------------------------------

const faqFields = {
  question: text(300),
  /**
   * ⚠ PLAIN TEXT ONLY. Answers are serialised into `FAQPage` JSON-LD, where
   * markup is invalid. Rejected here as well as by the table CHECK, so the
   * admin gets a message rather than a constraint violation.
   */
  answer: text(2000).refine((v) => !/<[a-zA-Z/!]/.test(v), {
    message: "must be plain text — it is published as structured data, which cannot contain HTML",
  }),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  published: z.boolean().optional(),
};

const faqMap = {
  question: "question",
  answer: "answer",
  sortOrder: "sort_order",
  published: "published",
} as const;

export const faqsCrud: AdminCrudHandlers = createAdminCrud({
  name: "faqs",
  table: "faqs",
  label: "FAQ",
  columns: `
    id::text AS id, question, answer, sort_order, published,
    created_at, updated_at, deleted_at`,
  softDelete: true,
  publishMode: "boolean",
  reorderable: true,
  createSchema: z.object(faqFields).strict(),
  updateSchema: z.object(faqFields).partial().strict(),
  toInsert: (input) => present(input, faqMap),
  toUpdate: (input) => present(input, faqMap),
});

// ---------------------------------------------------------------------------
// jobs
// ---------------------------------------------------------------------------

const jobFields = {
  slug,
  /** ⚠ The join key the career form submits (R-11). */
  title: text(200),
  employmentType: z.enum(["full_time", "part_time"]),
  /** D-015 — an FK plus a flag, never an enum. */
  branchId: z.string().uuid().nullish(),
  appliesToAllBranches: z.boolean().optional(),
  experience: text(120),
  excerpt: text(500),
  responsibilities: stringArray(30),
  requirements: stringArray(30),
  /** 🔴 Gates JobPosting markup. All six current roles are placeholders. */
  isPlaceholder: z.boolean().optional(),
  seoTitle: optionalText(200),
  seoDescription: optionalText(400),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  published: z.boolean().optional(),
};

const jobMap = {
  slug: "slug",
  title: "title",
  employmentType: "employment_type",
  branchId: "branch_id",
  appliesToAllBranches: "applies_to_all_branches",
  experience: "experience",
  excerpt: "excerpt",
  isPlaceholder: "is_placeholder",
  seoTitle: "seo_title",
  seoDescription: "seo_description",
  sortOrder: "sort_order",
  published: "published",
} as const;

export const jobsCrud: AdminCrudHandlers = createAdminCrud({
  name: "jobs",
  table: "jobs",
  label: "job",
  columns: `
    id::text AS id, slug, title, employment_type::text AS employment_type,
    branch_id::text AS branch_id, applies_to_all_branches, experience, excerpt,
    responsibilities, requirements, is_placeholder, seo_title, seo_description,
    sort_order, published, created_at, updated_at, deleted_at`,
  softDelete: true,
  publishMode: "boolean",
  reorderable: true,
  slugColumn: "slug",
  createSchema: z.object(jobFields).strict(),
  updateSchema: z.object(jobFields).partial().strict(),
  toInsert: (input) => ({
    ...present(input, jobMap),
    responsibilities: jsonb(input.responsibilities),
    requirements: jsonb(input.requirements),
  }),
  toUpdate: (input) => ({
    ...present(input, jobMap),
    ...(input.responsibilities !== undefined
      ? { responsibilities: jsonb(input.responsibilities) }
      : {}),
    ...(input.requirements !== undefined ? { requirements: jsonb(input.requirements) } : {}),
  }),
  validate: (input) => {
    // "Either branch" and "this specific branch" are mutually exclusive; the
    // table CHECK enforces it too, but this produces a readable message.
    if (input.applies_to_all_branches === true && input.branch_id != null) {
      return [
        "A job cannot both apply to all branches and name a specific one. Clear the branch, or turn off “applies to all branches”.",
      ];
    }
    return [];
  },
});

// ---------------------------------------------------------------------------
// blog posts
// ---------------------------------------------------------------------------

const postFields = {
  slug,
  title: text(300),
  excerpt: text(1000),
  coverMediaId: z.string().uuid().nullish(),
  authorName: text(200).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  seoTitle: optionalText(200),
  seoDescription: optionalText(400),
  readingMinutes: z.number().int().min(1).max(180).nullish(),
};

const postMap = {
  slug: "slug",
  title: "title",
  excerpt: "excerpt",
  coverMediaId: "cover_media_id",
  authorName: "author_name",
  seoTitle: "seo_title",
  seoDescription: "seo_description",
  readingMinutes: "reading_minutes",
} as const;

/**
 * Posts deliberately have NO `status` field in the create/update allowlist.
 *
 * Publishing goes through `POST /posts/{id}/publish`, which also manages
 * `published_at`. Allowing `status` here would let a PATCH publish a post
 * without setting a publication date — and the table CHECK would reject it,
 * producing a constraint error instead of a clear one.
 */
export const postsCrud: AdminCrudHandlers = createAdminCrud({
  name: "posts",
  table: "blog_posts",
  label: "post",
  columns: `
    id::text AS id, slug, title, excerpt, cover_media_id::text AS cover_media_id,
    author_name, tags, status::text AS status, published_at,
    seo_title, seo_description, reading_minutes, created_at, updated_at, deleted_at`,
  softDelete: true,
  publishMode: "status",
  reorderable: false,
  slugColumn: "slug",
  orderBy: "coalesce(published_at, created_at) DESC",
  createSchema: z.object(postFields).strict(),
  updateSchema: z.object(postFields).partial().strict(),
  toInsert: (input) => ({
    ...present(input, postMap),
    ...(input.tags !== undefined ? { tags: jsonb(input.tags) } : {}),
  }),
  toUpdate: (input) => ({
    ...present(input, postMap),
    ...(input.tags !== undefined ? { tags: jsonb(input.tags) } : {}),
  }),
});

// ---------------------------------------------------------------------------
// statistics — E13
// ---------------------------------------------------------------------------

const statFields = {
  value: z.number().int().min(0).max(1_000_000),
  suffix: optionalText(8),
  /** Used by the statistics band on / and /about. */
  label: text(120),
  /**
   * ✅ D-023 — the hero's OWN wording.
   *
   * The home page renders the same statistics twice with different words: the
   * band says "Years of expertise", the hero "Years practising". A single label
   * would change visible home-page text, which D-010 forbids.
   */
  heroLabel: optionalText(120),
  showInHero: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  published: z.boolean().optional(),
};

const statMap = {
  value: "value",
  suffix: "suffix",
  label: "label",
  heroLabel: "hero_label",
  showInHero: "show_in_hero",
  sortOrder: "sort_order",
  published: "published",
} as const;

export const statsCrud: AdminCrudHandlers = createAdminCrud({
  name: "stats",
  table: "stats",
  label: "statistic",
  columns: `
    id::text AS id, value, suffix, label, hero_label, show_in_hero,
    sort_order, published, created_at, updated_at`,
  // No `deleted_at` on this table — a statistic is cheap to recreate.
  softDelete: false,
  publishMode: "boolean",
  reorderable: true,
  createSchema: z.object(statFields).strict(),
  updateSchema: z.object(statFields).partial().strict(),
  toInsert: (input) => present(input, statMap),
  toUpdate: (input) => present(input, statMap),
  // ⚠ X-31: `StatsBand` keys its React list on `label`. A duplicate would
  // silently drop a tile. The unique index enforces it; the factory turns the
  // violation into a 409 with a readable message.
});

// ---------------------------------------------------------------------------
// social links — E13
// ---------------------------------------------------------------------------

const socialFields = {
  platform: text(60),
  /**
   * ⚠ Maps to a BUNDLED SVG. `Footer.tsx` ships exactly three glyphs
   * (facebook, instagram, youtube); an unknown key degrades to a text badge, so
   * the admin must warn rather than silently accept one.
   */
  iconKey: text(40),
  url: z.string().trim().url().max(500),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  published: z.boolean().optional(),
};

const socialMap = {
  platform: "platform",
  iconKey: "icon_key",
  url: "url",
  sortOrder: "sort_order",
  published: "published",
} as const;

/** The glyphs the frontend actually bundles. Anything else is a text badge. */
export const BUNDLED_SOCIAL_ICONS = ["facebook", "instagram", "youtube"] as const;

export const socialLinksCrud: AdminCrudHandlers = createAdminCrud({
  name: "social-links",
  table: "social_links",
  label: "social link",
  columns: `
    id::text AS id, platform, icon_key, url, sort_order, published,
    created_at, updated_at`,
  softDelete: false,
  publishMode: "boolean",
  reorderable: true,
  createSchema: z.object(socialFields).strict(),
  updateSchema: z.object(socialFields).partial().strict(),
  toInsert: (input) => present(input, socialMap),
  toUpdate: (input) => present(input, socialMap),
  validate: validateSocialLink,
});

/**
 * The social-link invariants, exported so they can be tested without standing
 * up a session, a CSRF token and an HTTP request for each case.
 */
export async function validateSocialLink(
  input: Record<string, unknown>,
  context: { id?: string },
): Promise<string[]> {
  const problems: string[] = [];

  const iconKey = input.icon_key;
  if (typeof iconKey === "string" && !BUNDLED_SOCIAL_ICONS.includes(iconKey as never)) {
    problems.push(
      `There is no bundled icon for "${iconKey}", so the footer will show a text badge ` +
        `instead of a glyph. Bundled icons: ${BUNDLED_SOCIAL_ICONS.join(", ")}.`,
    );
  }

  /**
     * ⚠ F-19, NARROWED. `frontend/src/app/videos/page.tsx:17` still does
     * `site.socials.find((s) => s.name === "YouTube")!` — a non-null assertion
     * — so losing the PUBLISHED YouTube link breaks that page.
     *
     * 🔴 This used to reject `published === false` outright, which was wrong in
     * two directions at once:
     *
     *   · On CREATE there is nothing to unpublish. Because `published` defaults
     *     to false (CLAUDE.md §9, "nothing publishes by default"), every attempt
     *     to add a social link through the admin form was rejected — with a
     *     message about "unpublishing" that did not describe what had happened.
     *   · It blocked Facebook and Instagram too, which no page asserts.
     *
   * So the rule is now exactly the frontend's actual dependency: you may not
   * take the YouTube link off the public site. Everything else is free.
   */
  if (input.published === false && context.id !== undefined) {
    // A publish toggle or a partial PATCH need not carry `platform`, so fall
    // back to the stored row rather than guessing.
    const platform =
      typeof input.platform === "string"
        ? input.platform
        : (
            await queryOne<{ platform: string }>(
              "SELECT platform FROM social_links WHERE id = $1",
              [context.id],
            )
          )?.platform;

    if (typeof platform === "string" && platform.trim().toLowerCase() === "youtube") {
      problems.push(
        "The YouTube link cannot be unpublished: the /videos page asserts that it exists " +
          "and its build fails without it (F-19, a frontend fix). Edit the URL instead, " +
          "or delete the link once that assertion is gone.",
      );
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// content lists — E13
// ---------------------------------------------------------------------------

const contentListFields = {
  collection: z.enum([
    "why_choose_us",
    "process",
    "philosophy",
    "achievements",
    "about_story",
  ]),
  /** "01"–"04" for `process`. */
  stepLabel: optionalText(8),
  /** NULL for achievements and about_story, which are text-only. */
  title: optionalText(200),
  text: text(2000),
  iconMediaId: z.string().uuid().nullish(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  published: z.boolean().optional(),
};

const contentListMap = {
  collection: "collection",
  stepLabel: "step_label",
  title: "title",
  text: "text",
  iconMediaId: "icon_media_id",
  sortOrder: "sort_order",
  published: "published",
} as const;

export const contentListsCrud: AdminCrudHandlers = createAdminCrud({
  name: "content-lists",
  table: "content_list_items",
  label: "list item",
  columns: `
    id::text AS id, collection::text AS collection, step_label, title, text,
    icon_media_id::text AS icon_media_id, sort_order, published,
    created_at, updated_at`,
  softDelete: false,
  publishMode: "boolean",
  reorderable: true,
  orderBy: "collection, sort_order, created_at",
  createSchema: z.object(contentListFields).strict(),
  updateSchema: z.object(contentListFields).partial().strict(),
  toInsert: (input) => present(input, contentListMap),
  toUpdate: (input) => present(input, contentListMap),
});

/** Every collection, so the route scaffolder and tests share one list. */
export const COLLECTIONS = {
  services: servicesCrud,
  testimonials: testimonialsCrud,
  videos: videosCrud,
  gallery: galleryCrud,
  faqs: faqsCrud,
  jobs: jobsCrud,
  posts: postsCrud,
  stats: statsCrud,
  "social-links": socialLinksCrud,
  "content-lists": contentListsCrud,
} as const;

export type CollectionName = keyof typeof COLLECTIONS;
