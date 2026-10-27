-- 017 · ordered image collections for service pages and the home hero (D-044)
--
-- The client asked for an admin-managed slider on the home hero and an
-- INDEPENDENT one on every service page: several images, a chosen main image,
-- and an order that survives a save.
--
-- Two halves, because the two surfaces already store their images differently:
--
--   · The home hero's image is a `content_block_items` row (group `images`) and
--     that table ALREADY models an ordered, media-backed list — `sort_order`,
--     `media_id`, `alt` and an alt-not-blank CHECK. D-041 says `home.hero` has
--     one row today; it never said one row was the maximum. So the hero needs
--     no new table, only a way to mark WHICH row is the main one.
--
--   · A service's image is a single `services.image_media_id`. P-019 omitted a
--     `service_images` table on the stated grounds that "no page would consume
--     it". A page now does, so that premise is spent and the table is added —
--     modelled on `gallery_images`, which is the existing precedent for an
--     ordered media-backed collection.
--
-- 🔴 ADDITIVE AND BACKWARD-COMPATIBLE, deliberately.
--
-- `services.image_media_id` is NOT touched, NOT migrated and NOT deprecated. It
-- stays the public `image` field that `openGraph.images`, the service cards and
-- the frontend's `RawService.image` all read today. A service with no rows in
-- `service_images` therefore renders exactly as it does now, and the slider
-- degrades to the single existing image. Nothing has to be backfilled for this
-- migration to be safe, and no existing row changes meaning.
--
-- Rollback is `DROP TABLE service_images` plus dropping the two `is_default`
-- objects. Both are safe while no code reads them, which is why the backend
-- ships before the frontend (see the release notes on this branch).

-- ---------------------------------------------------------------------------
-- service_images
-- ---------------------------------------------------------------------------

CREATE TABLE service_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CASCADE: the rows are part of the service, not independent content. A
  -- service is soft-deleted (`deleted_at`) in normal operation, so this fires
  -- only on a genuine hard delete, where leaving orphans would be worse.
  service_id uuid NOT NULL REFERENCES services (id) ON DELETE CASCADE,

  -- 🔴 RESTRICT, matching `gallery_images`. The admin "remove image" action
  -- deletes THIS row and never the Cloudinary asset; destroying an asset stays
  -- the separate, reference-checked media action. RESTRICT means that action
  -- cannot orphan a slide it does not know about.
  media_id   uuid NOT NULL REFERENCES media (id) ON DELETE RESTRICT,

  -- Per-slide alt text. Required, for the same reason `content_block_items`
  -- requires it: a slider of unlabelled photographs is an accessibility defect,
  -- and the admin has the context to describe each one.
  alt        text NOT NULL,

  sort_order int  NOT NULL DEFAULT 0,

  -- The main/default image — the slide the page opens on. Kept SEPARATE from
  -- `sort_order` because the client asked for both independently: the owner may
  -- want the running order to differ from the opening frame.
  is_default boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT service_images_alt_not_blank CHECK (length(trim(alt)) > 0)
);

-- The read path's exact ordering, so the slider's order is index-backed.
CREATE INDEX service_images_service_sort_idx
  ON service_images (service_id, sort_order, id);

CREATE INDEX service_images_media_idx ON service_images (media_id);

-- 🔴 AT MOST ONE DEFAULT PER SERVICE, enforced by the database rather than by
-- the handler. Two defaults would make the opening slide depend on row order,
-- which is exactly the class of "works until it doesn't" bug a partial unique
-- index removes for free. Zero defaults stays legal — that is a collection
-- whose first image by `sort_order` opens, and is the correct state both for an
-- empty collection and immediately after the chosen default is removed.
CREATE UNIQUE INDEX service_images_one_default_idx
  ON service_images (service_id) WHERE is_default;

-- The same image twice in one service is a mistake, not a feature: it would
-- produce two identical slides and two dots that look broken. Across DIFFERENT
-- services it is fine and deliberately still allowed.
CREATE UNIQUE INDEX service_images_unique_per_service_idx
  ON service_images (service_id, media_id);

CREATE TRIGGER service_images_set_updated_at
BEFORE UPDATE ON service_images FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- content_block_items.is_default — the hero's main slide
-- ---------------------------------------------------------------------------

-- `NOT NULL DEFAULT false` is safe on an existing table here: the column is new,
-- so every current row (including the single `home.hero` image) gets `false`,
-- and "no explicit default" already means "open on the first by sort_order".
-- The live hero therefore behaves identically before and after this migration.
ALTER TABLE content_block_items
  ADD COLUMN is_default boolean NOT NULL DEFAULT false;

-- One default per GROUP, not per block: a slot may hold several groups
-- (`images`, `rows`, `bulletList`), and each is an independent list.
CREATE UNIQUE INDEX content_block_items_one_default_idx
  ON content_block_items (block_id, group_key) WHERE is_default;
