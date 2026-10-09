/**
 * Public content reads — operations 7 to 21.
 *
 * Every function here returns **only published, non-deleted** rows, and every
 * payload is shaped to the frontend's EXISTING exported types so the generator's
 * transform stays mechanical and no component signature changes (D-016).
 *
 * Two shaping rules worth stating:
 *  · `copyStatus` is **dropped**. It has zero consumers in the frontend and is
 *    editorial state that should never be publicly visible.
 *  · YouTube thumbnail and watch URLs are **derived, never stored** — exactly as
 *    the existing `VideoCard` does.
 */

import { query, queryOne } from "../db";

/** Every collection carries a real `updatedAt`; it feeds sitemap lastModified. */
export interface Timestamped {
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export interface ServicePayload extends Timestamped {
  slug: string;
  title: string;
  excerpt: string;
  duration: string;
  /** Integer paise. The frontend formats; the API never sends a formatted price. */
  priceFromPaise: number | null;
  typicalCourse: string | null;
  body: string[];
  treats: string[];
  image: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

interface ServiceRow {
  slug: string;
  title: string;
  excerpt: string;
  duration: string;
  price_from_paise: number | null;
  typical_course: string | null;
  body: string[];
  treats: string[];
  image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: Date;
}

const SERVICE_SELECT = `
  SELECT s.slug, s.title, s.excerpt, s.duration, s.price_from_paise, s.typical_course,
         s.body, s.treats, m.secure_url AS image_url,
         s.seo_title, s.seo_description, s.updated_at
    FROM services s
    LEFT JOIN media m ON m.id = s.image_media_id AND m.deleted_at IS NULL`;

function toService(r: ServiceRow): ServicePayload {
  return {
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    duration: r.duration,
    priceFromPaise: r.price_from_paise,
    typicalCourse: r.typical_course,
    body: r.body,
    treats: r.treats,
    image: r.image_url,
    seoTitle: r.seo_title,
    seoDescription: r.seo_description,
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listServices(): Promise<ServicePayload[]> {
  const rows = await query<ServiceRow>(
    `${SERVICE_SELECT} WHERE s.published AND s.deleted_at IS NULL
      ORDER BY s.sort_order, s.created_at, s.id`,
  );
  return rows.map(toService);
}

export async function findService(slug: string): Promise<ServicePayload | undefined> {
  const row = await queryOne<ServiceRow>(
    `${SERVICE_SELECT} WHERE lower(s.slug) = lower($1) AND s.published AND s.deleted_at IS NULL`,
    [slug],
  );
  return row ? toService(row) : undefined;
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

export interface TestimonialPayload extends Timestamped {
  name: string;
  quote: string;
  /** The original free text where no date is known. Never an invented date. */
  when: string | null;
  givenOn: string | null;
  featured: boolean;
  practitioner: string | null;
}

export async function listTestimonials(
  featuredOnly = false,
): Promise<TestimonialPayload[]> {
  const rows = await query<{
    author_name: string;
    quote: string;
    when_label: string | null;
    given_on: Date | null;
    featured: boolean;
    practitioner_label: string | null;
    updated_at: Date;
  }>(
    `SELECT author_name, quote, when_label, given_on, featured, practitioner_label, updated_at
       FROM testimonials
      WHERE published AND deleted_at IS NULL
        AND ($1::boolean IS FALSE OR featured)
      ORDER BY sort_order, created_at, id`,
    [featuredOnly],
  );

  // 🔴 X-22: `rating` is deliberately NOT returned. TestimonialCard renders five
  // hardcoded stars independent of data, and `rating` is NULL on all 23 rows —
  // wiring the stars to it would strip them from every card.
  return rows.map((r) => ({
    name: r.author_name,
    quote: r.quote,
    when: r.when_label,
    givenOn: r.given_on ? r.given_on.toISOString().slice(0, 10) : null,
    featured: r.featured,
    practitioner: r.practitioner_label,
    updatedAt: r.updated_at.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

export interface VideoPayload extends Timestamped {
  id: string;
  title: string;
  translation: string | null;
  featured: boolean;
}

export async function listVideos(featuredOnly = false): Promise<VideoPayload[]> {
  const rows = await query<{
    youtube_id: string;
    title: string;
    translation: string | null;
    featured: boolean;
    updated_at: Date;
  }>(
    `SELECT youtube_id, title, translation, featured, updated_at
       FROM videos
      WHERE published AND deleted_at IS NULL
        AND ($1::boolean IS FALSE OR featured)
      ORDER BY sort_order, created_at, id`,
    [featuredOnly],
  );

  // The frontend's `Video.id` IS the YouTube id; thumb and embed URLs are
  // derived by `youtubeThumb` / `youtubeWatch`, which stay code-owned helpers.
  return rows.map((r) => ({
    id: r.youtube_id,
    title: r.title,
    translation: r.translation,
    featured: r.featured,
    updatedAt: r.updated_at.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export interface GalleryPayload extends Timestamped {
  src: string;
  alt: string;
  caption: string | null;
}

export async function listGallery(): Promise<GalleryPayload[]> {
  const rows = await query<{
    src: string | null;
    alt: string;
    alt_default: string | null;
    caption: string | null;
    updated_at: Date;
  }>(
    `SELECT m.secure_url AS src, g.alt, m.alt_default, g.caption, g.updated_at
       FROM gallery_images g
       JOIN media m ON m.id = g.media_id AND m.deleted_at IS NULL
      WHERE g.published AND g.deleted_at IS NULL
      ORDER BY g.sort_order, g.created_at, g.id`,
  );

  // `gallery_images.alt` WINS over `media.alt_default` where both exist — the
  // per-use alt describes this placement, the media default is a fallback.
  return rows.map((r) => ({
    src: r.src ?? "",
    alt: r.alt.trim() !== "" ? r.alt : (r.alt_default ?? ""),
    caption: r.caption,
    updatedAt: r.updated_at.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

export interface FaqPayload extends Timestamped {
  question: string;
  answer: string;
}

export async function listFaqs(): Promise<FaqPayload[]> {
  const rows = await query<{ question: string; answer: string; updated_at: Date }>(
    `SELECT question, answer, updated_at FROM faqs
      WHERE published AND deleted_at IS NULL
      ORDER BY sort_order, created_at, id`,
  );
  return rows.map((r) => ({
    question: r.question,
    answer: r.answer,
    updatedAt: r.updated_at.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface JobPayload extends Timestamped {
  slug: string;
  title: string;
  type: string;
  /** The DERIVED display string the frontend already consumes. */
  branch: string;
  experience: string;
  excerpt: string;
  responsibilities: string[];
  requirements: string[];
  /** Gates JobPosting structured data — never emitted while true. */
  isPlaceholder: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
}

interface JobRow {
  slug: string;
  title: string;
  employment_type: "full_time" | "part_time";
  branch_name: string | null;
  applies_to_all_branches: boolean;
  experience: string;
  excerpt: string;
  responsibilities: string[];
  requirements: string[];
  is_placeholder: boolean;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: Date;
}

const JOB_SELECT = `
  SELECT j.slug, j.title, j.employment_type, b.name AS branch_name,
         j.applies_to_all_branches, j.experience, j.excerpt,
         j.responsibilities, j.requirements, j.is_placeholder,
         j.seo_title, j.seo_description, j.updated_at
    FROM jobs j
    LEFT JOIN branches b ON b.id = j.branch_id`;

/**
 * D-015 display derivation — renders identically to today:
 *   applies_to_all_branches  → "Either branch"
 *   otherwise                → the branch's name
 */
function branchLabel(r: JobRow): string {
  if (r.applies_to_all_branches) return "Either branch";
  return r.branch_name ?? "Either branch";
}

const EMPLOYMENT_LABEL: Record<"full_time" | "part_time", string> = {
  full_time: "Full-time",
  part_time: "Part-time",
};

function toJob(r: JobRow): JobPayload {
  return {
    slug: r.slug,
    title: r.title,
    type: EMPLOYMENT_LABEL[r.employment_type],
    branch: branchLabel(r),
    experience: r.experience,
    excerpt: r.excerpt,
    responsibilities: r.responsibilities,
    requirements: r.requirements,
    isPlaceholder: r.is_placeholder,
    seoTitle: r.seo_title,
    seoDescription: r.seo_description,
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listJobs(): Promise<JobPayload[]> {
  const rows = await query<JobRow>(
    `${JOB_SELECT} WHERE j.published AND j.deleted_at IS NULL
      ORDER BY j.sort_order, j.created_at, j.id`,
  );
  return rows.map(toJob);
}

export async function findJob(slug: string): Promise<JobPayload | undefined> {
  const row = await queryOne<JobRow>(
    `${JOB_SELECT} WHERE lower(j.slug) = lower($1) AND j.published AND j.deleted_at IS NULL`,
    [slug],
  );
  return row ? toJob(row) : undefined;
}

// ---------------------------------------------------------------------------
// Content lists
// ---------------------------------------------------------------------------

export type ContentCollection =
  | "why_choose_us"
  | "process"
  | "philosophy"
  | "achievements"
  | "about_story";

export interface ContentListPayload extends Timestamped {
  collection: ContentCollection;
  step: string | null;
  title: string | null;
  text: string;
  icon: string | null;
}

export async function listContentLists(
  collection?: ContentCollection,
): Promise<ContentListPayload[]> {
  const rows = await query<{
    collection: ContentCollection;
    step_label: string | null;
    title: string | null;
    text: string;
    icon_url: string | null;
    updated_at: Date;
  }>(
    `SELECT c.collection, c.step_label, c.title, c.text,
            m.secure_url AS icon_url, c.updated_at
       FROM content_list_items c
       LEFT JOIN media m ON m.id = c.icon_media_id AND m.deleted_at IS NULL
      WHERE c.published
        AND ($1::text IS NULL OR c.collection::text = $1)
      ORDER BY c.collection, c.sort_order, c.created_at, c.id`,
    [collection ?? null],
  );

  return rows.map((r) => ({
    collection: r.collection,
    step: r.step_label,
    title: r.title,
    text: r.text,
    icon: r.icon_url,
    updatedAt: r.updated_at.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Page meta
// ---------------------------------------------------------------------------

export interface PageMetaPayload extends Timestamped {
  page: string;
  title: string | null;
  description: string | null;
  canonical: string | null;
  ogImage: string | null;
  noindex: boolean;
}

interface PageMetaRow {
  page: string;
  title: string | null;
  description: string | null;
  canonical: string | null;
  og_url: string | null;
  noindex: boolean;
  updated_at: Date;
}

const PAGE_META_SELECT = `
  SELECT p.page, p.title, p.description, p.canonical,
         m.secure_url AS og_url, p.noindex, p.updated_at
    FROM page_meta p
    LEFT JOIN media m ON m.id = p.og_media_id AND m.deleted_at IS NULL`;

function toPageMeta(r: PageMetaRow): PageMetaPayload {
  return {
    page: r.page,
    title: r.title,
    description: r.description,
    canonical: r.canonical,
    ogImage: r.og_url,
    noindex: r.noindex,
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listPageMeta(): Promise<PageMetaPayload[]> {
  const rows = await query<PageMetaRow>(`${PAGE_META_SELECT} ORDER BY p.page`);
  return rows.map(toPageMeta);
}

export async function findPageMeta(page: string): Promise<PageMetaPayload | undefined> {
  const row = await queryOne<PageMetaRow>(`${PAGE_META_SELECT} WHERE p.page = $1`, [page]);
  return row ? toPageMeta(row) : undefined;
}

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

export interface ContentBlockItemPayload {
  groupKey: string;
  itemType: string;
  label: string | null;
  value: string | null;
  text: string | null;
  href: string | null;
  iconKey: string | null;
  image: string | null;
  alt: string | null;
  lines: string[] | null;
}

export interface ContentBlockPayload extends Timestamped {
  page: string;
  slot: string;
  label: string | null;
  title: string | null;
  lead: string | null;
  body: string[] | null;
  cta: { label: string; href: string } | null;
  cta2: { label: string; href: string } | null;
  /** A destination whose label the component supplies from code (migration 013). */
  ctaHref: string | null;
  cta2Href: string | null;
  extra: Record<string, unknown> | null;
  items: ContentBlockItemPayload[];
}

export async function listContentBlocks(page?: string): Promise<ContentBlockPayload[]> {
  const blocks = await query<{
    id: string;
    page: string;
    slot: string;
    label: string | null;
    title: string | null;
    lead: string | null;
    body: string[] | null;
    cta_label: string | null;
    cta_href: string | null;
    cta2_label: string | null;
    cta2_href: string | null;
    extra: Record<string, unknown> | null;
    updated_at: Date;
  }>(
    `SELECT id::text AS id, page, slot, label, title, lead, body,
            cta_label, cta_href, cta2_label, cta2_href, extra, updated_at
       FROM content_blocks
      WHERE ($1::text IS NULL OR page = $1)
      ORDER BY page, slot`,
    [page ?? null],
  );

  if (blocks.length === 0) return [];

  const items = await query<{
    block_id: string;
    group_key: string;
    item_type: string;
    label: string | null;
    value: string | null;
    text: string | null;
    href: string | null;
    icon_key: string | null;
    image_url: string | null;
    alt: string | null;
    lines: string[] | null;
  }>(
    // One query for every block's items rather than one per block — the N+1 this
    // avoids would otherwise run ~41 times during each build.
    `SELECT i.block_id::text AS block_id, i.group_key, i.item_type::text AS item_type,
            i.label, i.value, i.text, i.href, i.icon_key,
            m.secure_url AS image_url, i.alt, i.lines
       FROM content_block_items i
       LEFT JOIN media m ON m.id = i.media_id AND m.deleted_at IS NULL
      WHERE i.block_id = ANY($1::uuid[])
      ORDER BY i.group_key, i.sort_order, i.created_at, i.id`,
    [blocks.map((b) => b.id)],
  );

  const byBlock = new Map<string, ContentBlockItemPayload[]>();
  for (const i of items) {
    const list = byBlock.get(i.block_id) ?? [];
    list.push({
      groupKey: i.group_key,
      itemType: i.item_type,
      label: i.label,
      value: i.value,
      text: i.text,
      href: i.href,
      iconKey: i.icon_key,
      image: i.image_url,
      alt: i.alt,
      lines: i.lines,
    });
    byBlock.set(i.block_id, list);
  }

  return blocks.map((b) => ({
    page: b.page,
    slot: b.slot,
    label: b.label,
    title: b.title,
    lead: b.lead,
    body: b.body,
    cta: b.cta_label && b.cta_href ? { label: b.cta_label, href: b.cta_href } : null,
    cta2: b.cta2_label && b.cta2_href ? { label: b.cta2_label, href: b.cta2_href } : null,
    // 🔴 A destination whose LABEL is code-owned, which migration 013 allows
    // (`home.testimonials` → "All {testimonials.length} reviews",
    // `about.story` → "Consult with {founder first name}"). Without these the
    // href would be editable in the admin, stored in the database and reach no
    // page at all — exactly the PUB-02 defect. The page renders its own label
    // and takes the destination from here.
    ctaHref: b.cta_label === null && b.cta_href !== null ? b.cta_href : null,
    cta2Href: b.cta2_label === null && b.cta2_href !== null ? b.cta2_href : null,
    extra: b.extra,
    items: byBlock.get(b.id) ?? [],
    updatedAt: b.updated_at.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Blog posts
// ---------------------------------------------------------------------------

export interface PostBlockPayload {
  type: string;
  textHtml: string | null;
  headingLevel: number | null;
  headingText: string | null;
  image: string | null;
  imageAlt: string | null;
  imageCaption: string | null;
  youtubeId: string | null;
  youtubeTitle: string | null;
  listItems: string[] | null;
}

export interface PostPayload extends Timestamped {
  slug: string;
  title: string;
  excerpt: string;
  cover: string | null;
  author: string;
  tags: string[];
  publishedAt: string | null;
  readingMinutes: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  blocks?: PostBlockPayload[];
}

interface PostRow {
  slug: string;
  title: string;
  excerpt: string;
  cover_url: string | null;
  author_name: string;
  tags: string[] | null;
  published_at: Date | null;
  reading_minutes: number | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: Date;
}

const POST_SELECT = `
  SELECT p.slug, p.title, p.excerpt, m.secure_url AS cover_url, p.author_name,
         p.tags, p.published_at, p.reading_minutes,
         p.seo_title, p.seo_description, p.updated_at
    FROM blog_posts p
    LEFT JOIN media m ON m.id = p.cover_media_id AND m.deleted_at IS NULL`;

function toPost(r: PostRow): PostPayload {
  return {
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    cover: r.cover_url,
    author: r.author_name,
    tags: r.tags ?? [],
    publishedAt: r.published_at ? r.published_at.toISOString() : null,
    readingMinutes: r.reading_minutes,
    seoTitle: r.seo_title,
    seoDescription: r.seo_description,
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listPosts(params: {
  page: number;
  limit: number;
  tag?: string;
}): Promise<{ items: PostPayload[]; total: number; page: number; limit: number }> {
  const offset = (params.page - 1) * params.limit;

  // Only `published` posts with a date — a draft must never be publicly
  // reachable, and the CHECK guarantees a published post has one.
  const where = `WHERE p.status = 'published' AND p.deleted_at IS NULL
                   AND p.published_at <= now()
                   AND ($1::text IS NULL OR p.tags ? $1)`;

  const totals = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM blog_posts p ${where}`,
    [params.tag ?? null],
  );

  const rows = await query<PostRow>(
    `${POST_SELECT} ${where} ORDER BY p.published_at DESC, p.id LIMIT $2 OFFSET $3`,
    [params.tag ?? null, params.limit, offset],
  );

  return {
    items: rows.map(toPost),
    total: Number(totals[0]?.count ?? "0"),
    page: params.page,
    limit: params.limit,
  };
}

export async function findPost(slug: string): Promise<PostPayload | undefined> {
  const row = await queryOne<PostRow & { id: string }>(
    `${POST_SELECT.replace("SELECT p.slug", "SELECT p.id::text AS id, p.slug")}
      WHERE lower(p.slug) = lower($1) AND p.status = 'published'
        AND p.deleted_at IS NULL AND p.published_at <= now()`,
    [slug],
  );

  if (!row) return undefined;

  const blocks = await query<{
    type: string;
    text_html: string | null;
    heading_level: number | null;
    heading_text: string | null;
    image_url: string | null;
    image_alt: string | null;
    image_caption: string | null;
    youtube_id: string | null;
    youtube_title: string | null;
    list_items: string[] | null;
  }>(
    `SELECT b.type::text AS type, b.text_html, b.heading_level, b.heading_text,
            m.secure_url AS image_url, b.image_alt, b.image_caption,
            b.youtube_id, b.youtube_title, b.list_items
       FROM blog_post_blocks b
       LEFT JOIN media m ON m.id = b.media_id AND m.deleted_at IS NULL
      WHERE b.post_id = $1
      ORDER BY b.sort_order, b.created_at, b.id`,
    [row.id],
  );

  return {
    ...toPost(row),
    blocks: blocks.map((b) => ({
      type: b.type,
      // Already sanitised ON WRITE; nothing is sanitised on read.
      textHtml: b.text_html,
      headingLevel: b.heading_level,
      headingText: b.heading_text,
      image: b.image_url,
      imageAlt: b.image_alt,
      imageCaption: b.image_caption,
      youtubeId: b.youtube_id,
      youtubeTitle: b.youtube_title,
      listItems: b.list_items,
    })),
  };
}

/** Newest `updated_at` across public content, for the collection ETag. */
export async function latestContentChange(): Promise<string | undefined> {
  const rows = await query<{ latest: Date | null }>(
    `SELECT max(updated_at) AS latest FROM (
        SELECT updated_at FROM services        WHERE published AND deleted_at IS NULL
        UNION ALL SELECT updated_at FROM testimonials WHERE published AND deleted_at IS NULL
        UNION ALL SELECT updated_at FROM videos       WHERE published AND deleted_at IS NULL
        UNION ALL SELECT updated_at FROM faqs         WHERE published AND deleted_at IS NULL
        UNION ALL SELECT updated_at FROM jobs         WHERE published AND deleted_at IS NULL
        UNION ALL SELECT updated_at FROM gallery_images WHERE published AND deleted_at IS NULL
        UNION ALL SELECT updated_at FROM content_list_items WHERE published
        UNION ALL SELECT updated_at FROM content_blocks
        UNION ALL SELECT updated_at FROM page_meta
        UNION ALL SELECT updated_at FROM site_settings
     ) AS all_content`,
  );
  return rows[0]?.latest?.toISOString();
}
