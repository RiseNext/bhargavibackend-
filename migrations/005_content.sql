-- M005 · content: services, testimonials, videos, gallery_images, faqs, jobs
--
-- Depends on: M003 (media), M004 (branches).
-- Seed: stage S1 — services 10 (image_media_id NULL) / testimonials 23 /
--       videos 19 / gallery_images 0 / faqs 6 / jobs 6.
--       🔴 gallery_images seeds in S2, NOT S1 (D-032).
-- Rollback: drop the six tables.
--
-- `published` defaults to false everywhere so nothing goes live by accident.
-- The S1 seed sets it true for content that is live today.

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------

CREATE TABLE services (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The 10 existing slugs are live URLs. Immutability once published is
  -- enforced in the application layer, which is where "published" is known.
  slug               text NOT NULL,
  title              text NOT NULL,
  excerpt            text NOT NULL,
  -- A display string, deliberately not numeric: the clinic writes ranges
  -- ("45–60 min").
  duration           text NOT NULL,
  -- Integer minor units, never float. ₹100 = 10000. Nullable because the UI
  -- hides the row when absent, which beats shipping a placeholder price.
  price_from_paise   int,
  typical_course     text,
  -- Ordered, variable-length, display-only lists never queried individually —
  -- child tables would add joins for no benefit.
  body               jsonb NOT NULL DEFAULT '[]'::jsonb,
  treats             jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_media_id     uuid REFERENCES media (id) ON DELETE SET NULL,
  -- Editorial state. Never exposed publicly, and `copyStatus` has zero
  -- consumers in the frontend, so the generated Service type drops it.
  copy_status        copy_status,
  seo_title          text,
  seo_description    text,
  og_media_id        uuid REFERENCES media (id) ON DELETE SET NULL,
  sort_order         int NOT NULL DEFAULT 0,
  published          boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,

  CONSTRAINT services_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT services_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT services_price_non_negative CHECK (price_from_paise IS NULL OR price_from_paise >= 0),
  CONSTRAINT services_body_is_array CHECK (jsonb_typeof(body) = 'array'),
  CONSTRAINT services_treats_is_array CHECK (jsonb_typeof(treats) = 'array')
);

-- Partial unique: a soft-deleted row must not block reusing its slug.
CREATE UNIQUE INDEX services_slug_key ON services (lower(slug)) WHERE deleted_at IS NULL;
CREATE INDEX services_published_sort_idx ON services (published, sort_order);
CREATE INDEX services_updated_idx ON services (updated_at DESC);

CREATE TRIGGER services_set_updated_at
BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- testimonials
-- ---------------------------------------------------------------------------

CREATE TABLE testimonials (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name        text NOT NULL,
  quote              text NOT NULL,
  -- Replaces the free-text `when`; the frontend relativises it.
  given_on           date,
  -- Migration fallback. 17 of 23 testimonials have no date at all, and
  -- inventing one would violate the no-hallucination rule — so the original
  -- free text ("a year ago") is preserved here instead.
  when_label         text,
  -- ⚠ X-22: TestimonialCard renders FIVE HARDCODED STARS independent of this
  -- column, and `rating` is NULL for all 23 seeded rows. Driving the stars from
  -- it would strip them from every card — a visible regression. Data only.
  rating             smallint,
  source             testimonial_source,
  source_url         text,
  -- 8 quotes name "Dr. Utheja". Free text until practitioners are modelled
  -- (I-3) — no page consumes a practitioner entity today.
  practitioner_label text,
  featured           boolean NOT NULL DEFAULT false,
  sort_order         int NOT NULL DEFAULT 0,
  published          boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,

  CONSTRAINT testimonials_author_not_blank CHECK (length(trim(author_name)) > 0),
  CONSTRAINT testimonials_quote_not_blank CHECK (length(trim(quote)) > 0),
  CONSTRAINT testimonials_rating_range CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5))
);

CREATE INDEX testimonials_published_featured_idx ON testimonials (published, featured, sort_order);
CREATE INDEX testimonials_published_sort_idx ON testimonials (published, sort_order);
CREATE INDEX testimonials_given_on_idx ON testimonials (given_on DESC);

CREATE TRIGGER testimonials_set_updated_at
BEFORE UPDATE ON testimonials FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- videos
-- ---------------------------------------------------------------------------

CREATE TABLE videos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Thumbnail and embed URLs are DERIVED from this, never stored — exactly as
  -- the existing VideoCard does.
  youtube_id  text NOT NULL,
  title       text NOT NULL,   -- often Telugu
  translation text,            -- English rendering; 14 of 19 have one
  featured    boolean NOT NULL DEFAULT false,
  sort_order  int NOT NULL DEFAULT 0,
  published   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  -- Exactly 11 characters. The same pattern guards blog YouTube blocks, where
  -- it also stops a full URL or iframe markup being stored.
  CONSTRAINT videos_youtube_id_format CHECK (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  CONSTRAINT videos_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE UNIQUE INDEX videos_youtube_id_key ON videos (youtube_id) WHERE deleted_at IS NULL;
CREATE INDEX videos_published_featured_idx ON videos (published, featured, sort_order);

CREATE TRIGGER videos_set_updated_at
BEFORE UPDATE ON videos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- gallery_images
-- ---------------------------------------------------------------------------
-- 🔴 D-032: `media_id` is NOT NULL and is NOT weakened. Cloudinary media does
-- not exist until Phase 6, so these 8 rows seed in stage S2 — after media —
-- rather than in S1. The staged seed exists precisely so this constraint can
-- stay strict.
--
-- A thin join over `media` so one uploaded file can also serve as a blog cover
-- or OG image without duplication.

CREATE TABLE gallery_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id   uuid NOT NULL REFERENCES media (id) ON DELETE RESTRICT,
  -- Required: the media library's `alt_default` is a fallback, but a gallery
  -- tile with no alt text is an accessibility defect.
  alt        text NOT NULL,
  caption    text,
  sort_order int NOT NULL DEFAULT 0,
  published  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT gallery_images_alt_not_blank CHECK (length(trim(alt)) > 0)
);

CREATE INDEX gallery_images_published_sort_idx ON gallery_images (published, sort_order);
CREATE INDEX gallery_images_media_idx ON gallery_images (media_id);

CREATE TRIGGER gallery_images_set_updated_at
BEFORE UPDATE ON gallery_images FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- faqs
-- ---------------------------------------------------------------------------

CREATE TABLE faqs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question   text NOT NULL,
  -- ⚠ PLAIN TEXT ONLY. This is serialised into FAQPage JSON-LD, where markup
  -- would be invalid. HTML is rejected in the application layer; the CHECK
  -- below catches the obvious cases at the storage boundary too.
  answer     text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  published  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT faqs_question_not_blank CHECK (length(trim(question)) > 0),
  CONSTRAINT faqs_answer_not_blank CHECK (length(trim(answer)) > 0),
  CONSTRAINT faqs_answer_is_plain_text CHECK (answer !~ '<[a-zA-Z/!]')
);

-- X-31: Accordion keys its React list on `item.question`.
CREATE UNIQUE INDEX faqs_question_key ON faqs (question) WHERE deleted_at IS NULL;
CREATE INDEX faqs_published_sort_idx ON faqs (published, sort_order);

CREATE TRIGGER faqs_set_updated_at
BEFORE UPDATE ON faqs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

CREATE TABLE jobs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    text NOT NULL,
  -- ⚠ The join key the career form submits is the TITLE string (R-11).
  title                   text NOT NULL,
  employment_type         employment_type NOT NULL,

  -- ✅ D-015: an FK plus a flag, NOT an enum. `branches` is admin-creatable —
  -- the clinic went from one branch to two in a month — and an enum would have
  -- required a developer-run migration to add a third, contradicting the whole
  -- point of the project.
  branch_id               uuid REFERENCES branches (id) ON DELETE SET NULL,
  applies_to_all_branches boolean NOT NULL DEFAULT false,

  experience              text NOT NULL,
  excerpt                 text NOT NULL,
  responsibilities        jsonb NOT NULL DEFAULT '[]'::jsonb,
  requirements            jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- A deliberate safety field: the API must refuse to emit JobPosting
  -- structured data while true, because Google penalises markup for listings
  -- that are not real vacancies. All 6 current roles are placeholders.
  is_placeholder          boolean NOT NULL DEFAULT true,
  seo_title               text,
  seo_description         text,
  sort_order              int NOT NULL DEFAULT 0,
  published               boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz,

  CONSTRAINT jobs_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT jobs_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT jobs_responsibilities_is_array CHECK (jsonb_typeof(responsibilities) = 'array'),
  CONSTRAINT jobs_requirements_is_array CHECK (jsonb_typeof(requirements) = 'array'),
  -- "Either branch" and "this specific branch" are mutually exclusive; allowing
  -- both would make the derived display string ambiguous.
  CONSTRAINT jobs_branch_scope_is_unambiguous CHECK (
    NOT (applies_to_all_branches AND branch_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX jobs_slug_key ON jobs (lower(slug)) WHERE deleted_at IS NULL;
CREATE INDEX jobs_published_sort_idx ON jobs (published, sort_order);
CREATE INDEX jobs_branch_idx ON jobs (branch_id);

CREATE TRIGGER jobs_set_updated_at
BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
