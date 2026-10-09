/**
 * Admin UI descriptors — what each collection shows and what it lets an editor
 * change.
 *
 * Data-driven rather than fourteen bespoke screens, for the same reason the CRUD
 * factory exists: fourteen hand-written forms is fourteen chances for one to
 * omit a confirmation, a required field, or an empty state. The descriptor is
 * also the single place the field list is stated, so it cannot drift from the
 * Zod allowlist it mirrors.
 *
 * Every screen derived from these gets, by construction: an empty state
 * distinguishable from a zero-result filter and from a failed query, a
 * confirmation on destructive actions, validation messages from the API, and
 * loading/saved/error states.
 */

export type FieldKind =
  | "text"
  | "textarea"
  | "slug"
  | "number"
  | "paise"
  | "boolean"
  | "select"
  | "stringList"
  | "date"
  | "media"
  | "url"
  | "email";

export interface FieldSpec {
  /** camelCase key, exactly as the API accepts it. */
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** Shown beneath the input. Use it to explain a trap, not to restate the label. */
  help?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  /**
   * Options that cannot be written here because they are ROWS, not constants.
   *
   * 🔴 Why this exists. `jobs.branchId` was `kind: "text"`, so choosing a branch
   * meant typing a UUID: a branch NAME was rejected as `branchId Invalid uuid`,
   * and there was nowhere in the admin to read the id from. That is the same
   * defect `MediaPicker` was built to fix for image fields, left in place for
   * this one. The screen that renders the form resolves this key to real
   * options; a field carrying it must be `kind: "select"`.
   */
  optionsFrom?: "branches";
  max?: number;
  /** Hidden on create, shown on edit (e.g. a slug that becomes immutable). */
  immutableWhenPublished?: boolean;
}

export interface ColumnSpec {
  name: string;
  label: string;
  /** Rendered as a status pill rather than raw text. */
  pill?: boolean;
}

export interface CollectionUi {
  /** URL segment under /admin/content and /api/admin. */
  slug: string;
  title: string;
  /** One sentence: what this screen is for. */
  description: string;
  /** Shown when the collection is genuinely empty. */
  emptyState: string;
  columns: ColumnSpec[];
  fields: FieldSpec[];
  canCreate: boolean;
  canDelete: boolean;
  canPublish: boolean;
  canReorder: boolean;
  /** Extra warning shown above the form. */
  notice?: string;
}

const PUBLISH_HELP =
  "Nothing publishes by default. Content goes live at the next site rebuild, which is " +
  "triggered automatically when you save.";

export const COLLECTION_UI: Record<string, CollectionUi> = {
  services: {
    slug: "services",
    title: "Services",
    description: "The ten therapies, their copy, pricing and detail-page content.",
    emptyState: "No services yet. The seed loads the clinic's ten therapies.",
    columns: [
      { name: "title", label: "Title" },
      { name: "slug", label: "Slug" },
      { name: "duration", label: "Duration" },
      { name: "price_from_paise", label: "From" },
      { name: "published", label: "Published", pill: true },
    ],
    fields: [
      {
        name: "slug",
        label: "URL slug",
        kind: "slug",
        required: true,
        immutableWhenPublished: true,
        help: "This is a live URL. It cannot be changed once the service is published.",
      },
      { name: "title", label: "Title", kind: "text", required: true, max: 200 },
      { name: "excerpt", label: "Card excerpt", kind: "textarea", required: true, max: 500 },
      {
        name: "duration",
        label: "Session length",
        kind: "text",
        required: true,
        max: 80,
        help: 'A display string, so ranges are fine — e.g. "45–60 min".',
      },
      {
        name: "priceFromPaise",
        label: "From (price)",
        kind: "paise",
        help: "Entered in rupees, stored in paise. Leave empty to hide the price row entirely.",
      },
      {
        name: "typicalCourse",
        label: "Typical course",
        kind: "text",
        max: 120,
        help: 'e.g. "2–4 sittings". Leave empty to hide the row.',
      },
      { name: "body", label: "Detail paragraphs", kind: "stringList" },
      { name: "treats", label: "Treats", kind: "stringList" },
      { name: "imageMediaId", label: "Image", kind: "media" },
      { name: "seoTitle", label: "SEO title", kind: "text", max: 200 },
      { name: "seoDescription", label: "SEO description", kind: "textarea", max: 400 },
      { name: "published", label: "Published", kind: "boolean", help: PUBLISH_HELP },
    ],
    canCreate: true,
    canDelete: true,
    canPublish: true,
    canReorder: true,
  },

  testimonials: {
    slug: "testimonials",
    title: "Testimonials",
    description: "Patient reviews. Six are featured on the home and about pages.",
    emptyState: "No testimonials yet.",
    columns: [
      { name: "author_name", label: "Name" },
      { name: "when_label", label: "When" },
      { name: "featured", label: "Featured", pill: true },
      { name: "published", label: "Published", pill: true },
    ],
    fields: [
      { name: "authorName", label: "Name", kind: "text", required: true, max: 200 },
      { name: "quote", label: "Quote", kind: "textarea", required: true, max: 4000 },
      {
        name: "givenOn",
        label: "Date given",
        kind: "date",
        help: "Leave empty if the real date is unknown — do not guess one.",
      },
      {
        name: "whenLabel",
        label: 'Relative wording ("a year ago")',
        kind: "text",
        max: 80,
        help: "Used when no exact date is known. This is what the card shows.",
      },
      {
        name: "rating",
        label: "Rating",
        kind: "number",
        help:
          "Recorded for reference only. The cards show five stars regardless, and wiring them " +
          "to this field would remove them from every existing testimonial.",
      },
      { name: "practitionerLabel", label: "Practitioner named", kind: "text", max: 120 },
      { name: "featured", label: "Featured", kind: "boolean" },
      { name: "published", label: "Published", kind: "boolean", help: PUBLISH_HELP },
    ],
    canCreate: true,
    canDelete: true,
    canPublish: true,
    canReorder: true,
  },

  videos: {
    slug: "videos",
    title: "Health Talks",
    description: "YouTube videos. Six are featured on the home page.",
    emptyState: "No videos yet.",
    columns: [
      { name: "title", label: "Title" },
      { name: "youtube_id", label: "YouTube id" },
      { name: "featured", label: "Featured", pill: true },
      { name: "published", label: "Published", pill: true },
    ],
    fields: [
      {
        name: "youtubeId",
        label: "YouTube id",
        kind: "text",
        required: true,
        max: 11,
        help:
          'The 11-character id only — the part after "v=". Not the whole URL. ' +
          "The thumbnail and player are built from it.",
      },
      { name: "title", label: "Title", kind: "text", required: true, max: 300 },
      {
        name: "translation",
        label: "English rendering",
        kind: "text",
        max: 300,
        help: "For Telugu titles. Shown beneath the title.",
      },
      { name: "featured", label: "Featured", kind: "boolean" },
      { name: "published", label: "Published", kind: "boolean", help: PUBLISH_HELP },
    ],
    canCreate: true,
    canDelete: true,
    canPublish: true,
    canReorder: true,
  },

  gallery: {
    slug: "gallery",
    title: "Clinic gallery",
    description: "Photographs of the clinic. The first four also appear on the about page.",
    emptyState: "No gallery images yet.",
    notice:
      "⚠ These are photographs taken inside a medical clinic. Before uploading, confirm no " +
      "patient is identifiable and that anyone visible has agreed to appear on the website.",
    columns: [
      { name: "alt", label: "Alt text" },
      { name: "caption", label: "Caption" },
      { name: "published", label: "Published", pill: true },
    ],
    fields: [
      { name: "mediaId", label: "Image", kind: "media", required: true },
      {
        name: "alt",
        label: "Alt text",
        kind: "text",
        required: true,
        max: 300,
        help:
          "Describe what the photograph shows, for anyone using a screen reader. " +
          "Required — a tile with no alt text is an accessibility defect.",
      },
      { name: "caption", label: "Caption", kind: "text", max: 300 },
      { name: "published", label: "Published", kind: "boolean", help: PUBLISH_HELP },
    ],
    canCreate: true,
    canDelete: true,
    canPublish: true,
    canReorder: true,
  },

  faqs: {
    slug: "faqs",
    title: "FAQs",
    description: "Shown on three pages, and published as structured data for search engines.",
    emptyState: "No FAQs yet.",
    notice:
      "Answers must be plain text. They are published as structured data, which cannot " +
      "contain formatting or links.",
    columns: [
      { name: "question", label: "Question" },
      { name: "published", label: "Published", pill: true },
    ],
    fields: [
      {
        name: "question",
        label: "Question",
        kind: "text",
        required: true,
        max: 300,
        help: "Must be unique — two identical questions would make one of them disappear.",
      },
      {
        name: "answer",
        label: "Answer",
        kind: "textarea",
        required: true,
        max: 2000,
        help: "Plain text only. No formatting, no links.",
      },
      { name: "published", label: "Published", kind: "boolean", help: PUBLISH_HELP },
    ],
    canCreate: true,
    canDelete: true,
    canPublish: true,
    canReorder: true,
  },

  jobs: {
    slug: "jobs",
    title: "Job openings",
    description: "Roles shown on the careers page and in the application form's dropdown.",
    emptyState: "No job openings yet.",
    notice:
      '⚠ Leave "placeholder role" ticked unless this is a real, current vacancy. Search ' +
      "engines penalise job markup for positions that are not genuinely open.",
    columns: [
      { name: "title", label: "Role" },
      { name: "employment_type", label: "Type" },
      { name: "is_placeholder", label: "Placeholder", pill: true },
      { name: "published", label: "Published", pill: true },
    ],
    fields: [
      {
        name: "slug",
        label: "URL slug",
        kind: "slug",
        required: true,
        immutableWhenPublished: true,
      },
      {
        name: "title",
        label: "Role title",
        kind: "text",
        required: true,
        max: 200,
        help:
          "The application form submits this exact text, so changing it on a published role " +
          "breaks the link to existing applications.",
      },
      {
        name: "employmentType",
        label: "Type",
        kind: "select",
        required: true,
        options: [
          { value: "full_time", label: "Full-time" },
          { value: "part_time", label: "Part-time" },
        ],
      },
      {
        name: "appliesToAllBranches",
        label: "Applies to all branches",
        kind: "boolean",
        help: 'Shows as "Either branch". Clear the specific branch below if you tick this.',
      },
      {
        name: "branchId",
        label: "Branch",
        kind: "select",
        optionsFrom: "branches",
        help: "Leave empty for all branches.",
      },
      { name: "experience", label: "Experience required", kind: "text", required: true, max: 120 },
      { name: "excerpt", label: "Summary", kind: "textarea", required: true, max: 500 },
      { name: "responsibilities", label: "Responsibilities", kind: "stringList" },
      { name: "requirements", label: "Requirements", kind: "stringList" },
      {
        name: "isPlaceholder",
        label: "Placeholder role",
        kind: "boolean",
        help: "Untick only for a real vacancy. This controls whether search-engine job markup is published.",
      },
      { name: "published", label: "Published", kind: "boolean", help: PUBLISH_HELP },
    ],
    canCreate: true,
    canDelete: true,
    canPublish: true,
    canReorder: true,
  },

  posts: {
    slug: "posts",
    title: "Blog",
    description: "Articles. The body is built from blocks, edited after saving the post.",
    emptyState: "No posts yet. Create one, then add its content blocks.",
    columns: [
      { name: "title", label: "Title" },
      { name: "status", label: "Status", pill: true },
      { name: "published_at", label: "Published" },
    ],
    fields: [
      {
        name: "slug",
        label: "URL slug",
        kind: "slug",
        required: true,
        immutableWhenPublished: true,
        help: "This is a live URL. It cannot be changed once the post is published.",
      },
      { name: "title", label: "Title", kind: "text", required: true, max: 300 },
      { name: "excerpt", label: "Excerpt", kind: "textarea", required: true, max: 1000 },
      { name: "coverMediaId", label: "Cover image", kind: "media" },
      { name: "authorName", label: "Author", kind: "text", max: 200 },
      { name: "tags", label: "Tags", kind: "stringList" },
      { name: "readingMinutes", label: "Reading time (minutes)", kind: "number" },
      { name: "seoTitle", label: "SEO title", kind: "text", max: 200 },
      { name: "seoDescription", label: "SEO description", kind: "textarea", max: 400 },
    ],
    canCreate: true,
    canDelete: true,
    canPublish: true,
    canReorder: false,
  },

  stats: {
    slug: "stats",
    title: "Statistics",
    description: "The counting figures on the home and about pages.",
    emptyState: "No statistics yet.",
    notice:
      "The home page shows these twice, with different wording in the hero. Fill in the hero " +
      "label only where it should differ from the band label.",
    columns: [
      { name: "label", label: "Band label" },
      { name: "hero_label", label: "Hero label" },
      { name: "value", label: "Value" },
      { name: "show_in_hero", label: "In hero", pill: true },
    ],
    fields: [
      { name: "value", label: "Number", kind: "number", required: true },
      { name: "suffix", label: "Suffix", kind: "text", max: 8, help: 'Usually "+", or empty.' },
      {
        name: "label",
        label: "Band label",
        kind: "text",
        required: true,
        max: 120,
        help: "Must be unique — a duplicate would make one of the tiles disappear.",
      },
      {
        name: "heroLabel",
        label: "Hero label",
        kind: "text",
        max: 120,
        help: "Leave empty to reuse the band label in the hero.",
      },
      { name: "showInHero", label: "Show in hero", kind: "boolean" },
      { name: "published", label: "Published", kind: "boolean" },
    ],
    canCreate: true,
    canDelete: true,
    canPublish: false,
    canReorder: true,
  },

  "social-links": {
    slug: "social-links",
    title: "Social links",
    description: "The footer's social icons.",
    emptyState: "No social links yet.",
    notice:
      "Only Facebook, Instagram and YouTube have a bundled icon. Any other platform shows as " +
      "a text badge instead of a glyph.",
    columns: [
      { name: "platform", label: "Platform" },
      { name: "url", label: "URL" },
      { name: "published", label: "Published", pill: true },
    ],
    fields: [
      { name: "platform", label: "Platform", kind: "text", required: true, max: 60 },
      {
        name: "iconKey",
        label: "Icon",
        kind: "select",
        required: true,
        options: [
          { value: "facebook", label: "Facebook" },
          { value: "instagram", label: "Instagram" },
          { value: "youtube", label: "YouTube" },
        ],
      },
      { name: "url", label: "URL", kind: "url", required: true },
      { name: "published", label: "Published", kind: "boolean" },
    ],
    canCreate: true,
    canDelete: true,
    canPublish: false,
    canReorder: true,
  },

  "content-lists": {
    slug: "content-lists",
    title: "Page lists",
    description:
      "The repeating groups: why choose us, our process, our philosophy, achievements and the about story.",
    emptyState: "No list items yet.",
    columns: [
      { name: "collection", label: "List" },
      { name: "title", label: "Title" },
      { name: "sort_order", label: "Order" },
    ],
    fields: [
      {
        name: "collection",
        label: "List",
        kind: "select",
        required: true,
        options: [
          { value: "why_choose_us", label: "Why choose us" },
          { value: "process", label: "Our process" },
          { value: "philosophy", label: "Our philosophy" },
          { value: "achievements", label: "Achievements" },
          { value: "about_story", label: "About story" },
        ],
      },
      { name: "stepLabel", label: "Step number", kind: "text", max: 8 },
      { name: "title", label: "Title", kind: "text", max: 200, help: "Leave empty for text-only items." },
      { name: "text", label: "Text", kind: "textarea", required: true, max: 2000 },
      { name: "iconMediaId", label: "Icon", kind: "media" },
      { name: "published", label: "Published", kind: "boolean" },
    ],
    canCreate: true,
    canDelete: true,
    canPublish: false,
    canReorder: true,
  },
};

export const COLLECTION_SLUGS = Object.keys(COLLECTION_UI);

export function collectionUi(slug: string): CollectionUi | undefined {
  return COLLECTION_UI[slug];
}

/** ₹ from paise, for display. Avoids float arithmetic in the UI. */
export function rupeesFromPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "";
  return (paise / 100).toString();
}

export function paiseFromRupees(rupees: string): number | null {
  const trimmed = rupees.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
