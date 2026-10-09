-- M004 · config: branches, site_settings, social_links, stats
--
-- Depends on: M003 (media FKs).  Seed: stage S1 — 2 / 1 / 3 / 4.
-- Rollback: drop the four tables.
--
-- Verification this migration must satisfy:
--   · sort_order       Chikkadpally = 1, Bowenpally = 2
--   · phone_sort_order Bowenpally   = 1, Chikkadpally = 2   ← independent (D-013)
--   · exactly one is_primary
--   · site_settings rejects a second row
--   · stats.hero_label present on rows 1 and 4

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------

CREATE TABLE branches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL,
  name             text NOT NULL,
  is_primary       boolean NOT NULL DEFAULT false,

  -- 🔴 TWO INDEPENDENT ORDERINGS (D-013). In the live frontend
  -- `site.branches[0]` is Chikkadpally while `site.phones[0]` is Bowenpally —
  -- the arrays are exact reverses. A single column cannot produce both, and
  -- collapsing them silently flips 8 rendered phone numbers across 5 surfaces
  -- or mispairs the MedicalClinic JSON-LD telephone.
  sort_order       int NOT NULL DEFAULT 0,   -- branch DISPLAY order
  phone_sort_order int NOT NULL DEFAULT 0,   -- order of the derived phones[]

  phone_label      text,
  phone_e164       text,
  whatsapp_e164    text,

  -- All nullable: Bowenpally's address, coordinates, map and hours exist
  -- nowhere in the client's content (C-2, C-3). A NOT NULL column here would
  -- force invented data, which the no-hallucination rule forbids.
  address_line1    text,
  address_line2    text,
  address_city     text,
  address_state    text,
  address_postal   text,
  address_country  text,
  address_full     text,
  lat              double precision,
  lng              double precision,
  maps_url         text,
  map_embed_src    text,

  -- Per-day, multi-window, split-shift capable (P-008):
  --   [{ "day": "monday", "windows": [{ "open": "09:00", "close": "21:00" }] }]
  -- 🔴 This structured shape is BACKEND-ONLY. The frontend's three live
  -- consumers read `{days, time}` display strings, and the build-time generator
  -- performs that transform (D-028). Emitting the structured shape into
  -- `site.hours` is a TypeScript build failure plus wrong copy on three surfaces.
  hours            jsonb,

  -- A row value, never a constant in business logic (D-020). A grep for the
  -- clinic's address in backend source must return zero hits outside the seed.
  notify_email     text,

  -- 🔴 D-025: `is_active` is the ONLY deactivation mechanism. There is no
  -- `deleted_at` and no DELETE endpoint — deleting a branch would orphan
  -- historical leads. Hiding is a PATCH.
  is_active        boolean NOT NULL DEFAULT true,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT branches_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT branches_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT branches_lat_range CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90)),
  CONSTRAINT branches_lng_range CHECK (lng IS NULL OR (lng >= -180 AND lng <= 180)),
  -- Coordinates are meaningless individually; requiring both together is what
  -- the per-branch JSON-LD gating rule actually depends on.
  CONSTRAINT branches_geo_is_a_pair CHECK ((lat IS NULL) = (lng IS NULL)),
  CONSTRAINT branches_hours_is_array CHECK (hours IS NULL OR jsonb_typeof(hours) = 'array'),
  CONSTRAINT branches_phone_e164_format CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT branches_whatsapp_e164_format CHECK (whatsapp_e164 IS NULL OR whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE UNIQUE INDEX branches_slug_key ON branches (slug);
CREATE UNIQUE INDEX branches_name_key ON branches (name);
-- At most one primary branch, enforced rather than asserted in a comment.
CREATE UNIQUE INDEX branches_single_primary_idx ON branches ((is_primary)) WHERE is_primary;
CREATE INDEX branches_sort_idx ON branches (sort_order);
CREATE INDEX branches_phone_sort_idx ON branches (phone_sort_order);

CREATE TRIGGER branches_set_updated_at
BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- site_settings — singleton
-- ---------------------------------------------------------------------------
-- `phones[]` is NOT stored here. It is derived from branches ordered by
-- `phone_sort_order` (D-013).

CREATE TABLE site_settings (
  -- The CHECK is what makes this a singleton: a second INSERT fails rather than
  -- creating a second source of business facts.
  id                         int PRIMARY KEY DEFAULT 1,

  business_name              text NOT NULL,
  short_name                 text NOT NULL,
  tagline                    text,
  description                text,
  locale                     text NOT NULL DEFAULT 'en_IN',

  founder_name               text,
  founder_honorific          text,
  founder_qualifications     text,
  founder_role               text,
  founder_photo_media_id     uuid REFERENCES media (id) ON DELETE SET NULL,

  public_email               text,
  default_whatsapp_e164      text,
  -- Notification destinations are settings, not deployment config (D-020).
  default_notify_email       text,
  careers_notify_email       text,

  price_range                text,

  logo_media_id              uuid REFERENCES media (id) ON DELETE SET NULL,
  logo_lockup_media_id       uuid REFERENCES media (id) ON DELETE SET NULL,
  og_media_id                uuid REFERENCES media (id) ON DELETE SET NULL,
  brand_color                text,
  -- Two different values exist in the live frontend (brandColor #44683d vs
  -- viewport.themeColor #3d2a1e). Both are preserved rather than reconciled.
  theme_color                text,

  default_seo_title_template text,
  default_seo_description    text,
  robots_allow               boolean NOT NULL DEFAULT true,

  -- Stays NULL until the client supplies one (C-15). Deliberately a column and
  -- not an env var, so enabling analytics is a settings edit.
  analytics_measurement_id   text,

  updated_at                 timestamptz NOT NULL DEFAULT now(),
  updated_by                 uuid REFERENCES admin_users (id) ON DELETE SET NULL,

  CONSTRAINT site_settings_singleton CHECK (id = 1),
  CONSTRAINT site_settings_business_name_not_blank CHECK (length(trim(business_name)) > 0),
  CONSTRAINT site_settings_brand_color_hex CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT site_settings_theme_color_hex CHECK (theme_color IS NULL OR theme_color ~ '^#[0-9a-fA-F]{6}$')
);

CREATE TRIGGER site_settings_set_updated_at
BEFORE UPDATE ON site_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- social_links
-- ---------------------------------------------------------------------------

CREATE TABLE social_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform   text NOT NULL,
  -- ⚠ Maps to a BUNDLED SVG. Footer.tsx ships exactly three glyphs; an unknown
  -- key degrades to a text badge, so the admin must warn when one is entered.
  icon_key   text NOT NULL,
  url        text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  published  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT social_links_platform_not_blank CHECK (length(trim(platform)) > 0),
  CONSTRAINT social_links_url_is_http CHECK (url ~ '^https?://')
);

CREATE UNIQUE INDEX social_links_platform_key ON social_links (platform);
CREATE INDEX social_links_published_sort_idx ON social_links (published, sort_order);

CREATE TRIGGER social_links_set_updated_at
BEFORE UPDATE ON social_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- stats
-- ---------------------------------------------------------------------------

CREATE TABLE stats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value       int NOT NULL,
  suffix      text,
  -- Used by the statistics band on / and /about.
  label       text NOT NULL,
  -- ✅ D-023. The home page renders the SAME statistics twice with DIFFERENT
  -- wording: the band says "Years of expertise", the hero says "Years
  -- practising". One label column would change visible home-page text, which
  -- D-010 forbids. Resolution rule: heroLabel ?? label.
  hero_label  text,
  show_in_hero boolean NOT NULL DEFAULT false,
  sort_order  int NOT NULL DEFAULT 0,
  published   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stats_value_non_negative CHECK (value >= 0),
  CONSTRAINT stats_label_not_blank CHECK (length(trim(label)) > 0)
);

-- X-31: StatsBand keys its React list on `stat.label`. Once an admin can create
-- rows, a duplicate label would silently drop a tile. Enforced here, not just in
-- the admin form.
CREATE UNIQUE INDEX stats_label_key ON stats (label);
CREATE INDEX stats_published_sort_idx ON stats (published, sort_order);
CREATE INDEX stats_hero_idx ON stats (show_in_hero, sort_order);

CREATE TRIGGER stats_set_updated_at
BEFORE UPDATE ON stats FOR EACH ROW EXECUTE FUNCTION set_updated_at();
