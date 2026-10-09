-- M007 · page copy: content_blocks, content_block_items, content_list_items, page_meta
--
-- Depends on: M003 (media).
-- Seed: stage S1 — content_list_items 19 (icon_media_id NULL) + page_meta 9.
--       stage S3 — content_blocks 41 + content_block_items 18 (3 of which need
--                  S2's media, per D-027).
-- Rollback: drop the four tables.

-- ---------------------------------------------------------------------------
-- content_blocks — per page+slot hero and section copy
-- ---------------------------------------------------------------------------

CREATE TABLE content_blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page       text NOT NULL,
  slot       text NOT NULL,
  -- The small eyebrow line. `home.hero` calls it an "eyebrow"; same field.
  label      text,
  title      text,
  lead       text,
  -- Ordered string[] for multi-paragraph slots.
  body       jsonb,
  cta_label  text,
  cta_href   text,
  -- ✅ D-024: four slots need a second link pair — home.hero, home.ctaBand,
  -- blog.comingSoon, careers.generalApplication. No slot needs three, so two
  -- pairs is provably sufficient rather than a guess.
  cta2_label text,
  cta2_href  text,
  -- ✅ D-024: NAMED one-off fields for this slot, validated against a per-slot
  -- key allowlist on write. An escape hatch with a schema, not an untyped
  -- bucket — an unknown key is rejected.
  extra      jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT content_blocks_page_format CHECK (page ~ '^[a-z][a-zA-Z0-9_]*$'),
  CONSTRAINT content_blocks_slot_format CHECK (slot ~ '^[a-z][a-zA-Z0-9_]*$'),
  CONSTRAINT content_blocks_body_is_array CHECK (body IS NULL OR jsonb_typeof(body) = 'array'),
  CONSTRAINT content_blocks_extra_is_object CHECK (extra IS NULL OR jsonb_typeof(extra) = 'object'),
  -- A label with no destination renders a dead button.
  CONSTRAINT content_blocks_cta_is_a_pair CHECK ((cta_label IS NULL) = (cta_href IS NULL)),
  CONSTRAINT content_blocks_cta2_is_a_pair CHECK ((cta2_label IS NULL) = (cta2_href IS NULL)),
  -- A second CTA without a first would render in the primary position.
  CONSTRAINT content_blocks_cta2_needs_cta CHECK (cta2_label IS NULL OR cta_label IS NOT NULL)
);

CREATE UNIQUE INDEX content_blocks_page_slot_key ON content_blocks (page, slot);
CREATE INDEX content_blocks_page_idx ON content_blocks (page);

CREATE TRIGGER content_blocks_set_updated_at
BEFORE UPDATE ON content_blocks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- content_block_items — ✅ D-024, repeating groups inside a slot
-- ---------------------------------------------------------------------------
-- Six groups, 18 rows total.
--
-- ⚠ Two groups hold values that are DERIVED today: appointmentBand.rows and
-- contact.infoCards.lines read from site settings and branches. Those rows store
-- only the labels and structure; the values stay derived so a phone-number
-- change still propagates from one place. That is why `value` and `lines` are
-- nullable.

CREATE TABLE content_block_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE is correct here and in blog blocks only: an item has no meaning
  -- without its parent slot.
  block_id   uuid NOT NULL REFERENCES content_blocks (id) ON DELETE CASCADE,
  -- Which group within the slot: `images`, `rows`, `bulletList`, `items`.
  group_key  text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  item_type  content_block_item_type NOT NULL,
  label      text,
  value      text,
  text       text,
  href       text,
  -- Maps to a BUNDLED glyph, same pattern as social_links.icon_key.
  icon_key   text,
  media_id   uuid REFERENCES media (id) ON DELETE SET NULL,
  alt        text,
  -- Ordered string[] for multi-line cards.
  lines      jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT content_block_items_group_format CHECK (group_key ~ '^[a-z][a-zA-Z0-9_]*$'),
  CONSTRAINT content_block_items_lines_is_array CHECK (lines IS NULL OR jsonb_typeof(lines) = 'array'),
  -- An image without alt text is an accessibility defect, and these three rows
  -- are the D-027 home-page images that carry their own authored alt.
  CONSTRAINT content_block_items_image_has_alt CHECK (
    media_id IS NULL OR (alt IS NOT NULL AND length(trim(alt)) > 0)
  )
);

CREATE INDEX content_block_items_block_group_sort_idx
  ON content_block_items (block_id, group_key, sort_order);

CREATE TRIGGER content_block_items_set_updated_at
BEFORE UPDATE ON content_block_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- content_list_items
-- ---------------------------------------------------------------------------
-- One table for five small repeating groups: identical shapes, identical admin
-- UI, trivially filtered.
--
-- ⚠ `philosophy` currently lives INSIDE about/page.tsx, not a content file —
-- the easiest thing to miss on migration.

CREATE TABLE content_list_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection    content_collection NOT NULL,
  -- "01"–"04" for `process`.
  step_label    text,
  -- NULL for achievements and about_story, which are text-only.
  title         text,
  text          text NOT NULL,
  icon_media_id uuid REFERENCES media (id) ON DELETE SET NULL,
  sort_order    int NOT NULL DEFAULT 0,
  published     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT content_list_items_text_not_blank CHECK (length(trim(text)) > 0)
);

CREATE INDEX content_list_items_collection_sort_idx
  ON content_list_items (collection, sort_order);

CREATE TRIGGER content_list_items_set_updated_at
BEFORE UPDATE ON content_list_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- page_meta — per-page SEO
-- ---------------------------------------------------------------------------
-- 9 rows, not 11. `/services/[slug]` is a generated template whose values live
-- in `services.seo_*`, and `not-found` exports no metadata at all today — so
-- seeding 11 would create two rows with no source.

CREATE TABLE page_meta (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Matches content_blocks.page.
  page        text NOT NULL,
  -- NULL falls back to the site-wide template.
  title       text,
  description text,
  canonical   text,
  og_media_id uuid REFERENCES media (id) ON DELETE SET NULL,
  noindex     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT page_meta_page_format CHECK (page ~ '^[a-z][a-zA-Z0-9_]*$')
);

CREATE UNIQUE INDEX page_meta_page_key ON page_meta (page);

CREATE TRIGGER page_meta_set_updated_at
BEFORE UPDATE ON page_meta FOR EACH ROW EXECUTE FUNCTION set_updated_at();
