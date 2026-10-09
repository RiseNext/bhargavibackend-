-- M008 · blog: blog_posts, blog_post_blocks
--
-- Depends on: M003 (media).  Seed: 0 — no posts exist. Entirely greenfield.
-- Rollback: drop the two tables.
--
-- ✅ D-022: a post body is an ORDERED LIST OF TYPED BLOCKS, not a single string.
-- The blog is explicitly not markdown-only.

CREATE TABLE blog_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL,
  title           text NOT NULL,
  excerpt         text NOT NULL,
  cover_media_id  uuid REFERENCES media (id) ON DELETE SET NULL,
  author_name     text NOT NULL DEFAULT 'Anjana Bhargavi',
  -- string[]; promoted to a join table only if tag landing pages are built.
  tags            jsonb,
  -- `status` + `published_at` rather than a bare boolean, because posts need
  -- scheduling and a stable publication date for BlogPosting markup.
  status          blog_status NOT NULL DEFAULT 'draft',
  published_at    timestamptz,
  seo_title       text,
  seo_description text,
  reading_minutes int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,

  CONSTRAINT blog_posts_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT blog_posts_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT blog_posts_tags_is_array CHECK (tags IS NULL OR jsonb_typeof(tags) = 'array'),
  CONSTRAINT blog_posts_reading_minutes_positive CHECK (reading_minutes IS NULL OR reading_minutes > 0),
  -- A published post without a date cannot produce valid BlogPosting markup or
  -- a meaningful sitemap entry.
  CONSTRAINT blog_posts_published_has_date CHECK (
    status <> 'published' OR published_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX blog_posts_slug_key ON blog_posts (lower(slug)) WHERE deleted_at IS NULL;
CREATE INDEX blog_posts_status_published_idx ON blog_posts (status, published_at DESC);
CREATE INDEX blog_posts_updated_idx ON blog_posts (updated_at DESC);

CREATE TRIGGER blog_posts_set_updated_at
BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- blog_post_blocks
-- ---------------------------------------------------------------------------
-- A child table rather than a jsonb blob because blocks are ordered,
-- individually editable, individually validated, and `image` blocks need a real
-- FK so the media library can refuse to delete an image still in use.
--
-- ⚠ `text_html` is the ONLY path in this schema that accepts markup, and is
-- therefore the system's only real XSS vector. It is sanitised against a strict
-- allowlist ON WRITE — never stored raw, never sanitised on read.

CREATE TABLE blog_post_blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid NOT NULL REFERENCES blog_posts (id) ON DELETE CASCADE,
  sort_order    int NOT NULL DEFAULT 0,
  type          blog_block_type NOT NULL,

  -- `text` / `quote`. Sanitised server-side on write.
  text_html     text,
  -- `heading`. h1 is the post title, so a block heading starts at h2.
  heading_level smallint,
  heading_text  text,
  media_id      uuid REFERENCES media (id) ON DELETE RESTRICT,
  image_alt     text,
  image_caption text,
  -- `youtube`. THE ID ONLY — never a URL, never iframe markup. The embed URL is
  -- derived exactly as the existing VideoCard does.
  youtube_id    text,
  youtube_title text,
  -- `list`. Ordered array of plain strings; no markup accepted.
  list_items    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT blog_blocks_heading_level_range CHECK (
    heading_level IS NULL OR (heading_level BETWEEN 2 AND 4)
  ),
  -- Rejects 10 and 12 characters as well as URLs — the exact failure the
  -- verification criterion names.
  CONSTRAINT blog_blocks_youtube_id_format CHECK (
    youtube_id IS NULL OR youtube_id ~ '^[A-Za-z0-9_-]{11}$'
  ),
  CONSTRAINT blog_blocks_list_is_array CHECK (
    list_items IS NULL OR jsonb_typeof(list_items) = 'array'
  ),
  -- Each type must carry exactly the payload it renders from. Without this a
  -- block can be saved that renders as nothing at all.
  CONSTRAINT blog_blocks_payload_matches_type CHECK (
    CASE type
      WHEN 'text'    THEN text_html IS NOT NULL
      WHEN 'quote'   THEN text_html IS NOT NULL
      WHEN 'heading' THEN heading_text IS NOT NULL AND heading_level IS NOT NULL
      WHEN 'image'   THEN media_id IS NOT NULL AND image_alt IS NOT NULL AND length(trim(image_alt)) > 0
      WHEN 'youtube' THEN youtube_id IS NOT NULL
      WHEN 'list'    THEN list_items IS NOT NULL AND jsonb_array_length(list_items) > 0
    END
  )
);

CREATE INDEX blog_post_blocks_post_sort_idx ON blog_post_blocks (post_id, sort_order);
CREATE INDEX blog_post_blocks_media_idx ON blog_post_blocks (media_id);

CREATE TRIGGER blog_post_blocks_set_updated_at
BEFORE UPDATE ON blog_post_blocks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
