-- 014 — bring stored content in line with D-040 and D-041.
--
-- 🔴 WHY A DATA MIGRATION AND NOT A RESEED. Production content is real, edited
-- content (D-003). A reseed would overwrite anything the owner has changed
-- since launch. This migration touches ONLY the rows the two decisions name,
-- and only the specific columns that must become NULL or disappear — every
-- other value, including every edit, is left exactly as it is.
--
-- 🔴 WHY IT MUST RUN AFTER 013. Migration 013 replaced
-- `content_blocks_cta_is_a_pair` with `content_blocks_cta_label_needs_href`.
-- Under the OLD constraint, NULLing a `cta_label` while keeping its `cta_href`
-- is rejected outright — which is exactly what §2 below does for the two split
-- CTAs. Running this before 013 fails loudly rather than corrupting anything,
-- but the intended order is 012 → 013 → 014.
--
-- 🔴 IDEMPOTENT. Every statement is a conditional UPDATE or a DELETE on a
-- predicate that stops matching once applied. Running it twice changes nothing
-- the second time, which matters because a half-finished deploy must be safe to
-- re-run. `scripts/verify-reconciliation.mts` asserts this by running it twice.
--
-- The field list is NOT retyped here from memory: `tests/reconciliation.test.ts`
-- cross-checks this file against `CODE_OWNED_FIELDS` and `EXTRA_ALLOWLIST`, so
-- the migration and the classification cannot drift apart.

-- ---------------------------------------------------------------------------
-- 1. Code-owned TEXT fields — a stored copy of a derived value.
-- ---------------------------------------------------------------------------
--
-- Each of these renders from an expression today, so the stored string is a
-- frozen duplicate that stops tracking its source. Observed in production
-- before this migration:
--
--   home.hero.title     "Wellness Center made for you"
--                       — three separately-delayed <Wipe> spans, the third
--                         carrying `italic text-terracotta`. One string cannot
--                         express it.
--   home.hero.label     "Bhargavi Health World · Chikkadpally, Hyderabad"
--                       — interpolates `site.name`.
--   about.hero.title    carries the FROZEN honorific ("Mrs."), which D-003
--                       makes an admin-editable setting.

UPDATE content_blocks SET title = NULL
 WHERE title IS NOT NULL
   AND (page, slot) IN (('home', 'hero'), ('about', 'hero'), ('serviceDetail', 'bookingAside'));

UPDATE content_blocks SET label = NULL
 WHERE label IS NOT NULL
   AND (page, slot) IN (('home', 'hero'));

UPDATE content_blocks SET lead = NULL
 WHERE lead IS NOT NULL
   AND (page, slot) IN (
     ('home', 'hero'),            -- names the founder
     ('home', 'healthTalks'),     -- `${honorific} ${name} on pressure points…`
     ('about', 'hero'),
     ('testimonials', 'hero'),
     ('videos', 'hero')
   );

-- ---------------------------------------------------------------------------
-- 2. Code-owned CTA halves.
-- ---------------------------------------------------------------------------
--
-- 🔴 The worst row in production is `global.ctaBand.cta2_href`, which stores
-- the literal source text of an expression:
--
--     cta2_href = 'site.phones[0].href'
--
-- That is not a URL. Had anything rendered it, the button would have pointed at
-- a relative path literally named `site.phones[0].href` — a broken primary
-- call-to-action. `cta2_label` beside it froze a phone number
-- ("Call +91 70751 57013") that D-013 says must be resolved by
-- `phone_sort_order` at render time.
--
-- Both halves of these two CTAs are code-owned, so both columns clear.

UPDATE content_blocks SET cta2_label = NULL, cta2_href = NULL
 WHERE (cta2_label IS NOT NULL OR cta2_href IS NOT NULL)
   AND (page, slot) IN (('global', 'ctaBand'), ('careers', 'generalApplication'));

-- Here only the LABEL is code-owned; the destination is real editable copy and
-- is deliberately KEPT. Production froze a derivation in each:
--
--   about.story        "Consult with Anjana"  → `Consult with {founder first name}`
--   home.testimonials  "All 23 reviews"       → `All {testimonials.length} reviews`
--
-- The surviving href-without-label is what migration 013 exists to permit, and
-- what `ctaHref` in the public payload now carries to the page.

UPDATE content_blocks SET cta_label = NULL
 WHERE cta_label IS NOT NULL
   AND (page, slot) IN (('about', 'story'), ('home', 'testimonials'));

-- ---------------------------------------------------------------------------
-- 3. `extra` keys that are no longer allowlisted.
-- ---------------------------------------------------------------------------
--
-- `validateExtra()` rejects an unknown key on write, so these would block the
-- owner's next save of an otherwise untouched slot. Three of them never held
-- copy at all — they stored a DESCRIPTION OF A FORMAT:
--
--   indexBadge      "01, 02, ... (1-based, zero-padded)"
--   metaLine        "<type> · <branch> · <experience>"
--   modalAriaLabel  "Apply — <job.title>"
--
-- `-` on jsonb removes a key if present and is a no-op otherwise, so this is
-- idempotent by construction.

UPDATE content_blocks
   SET extra = extra - 'indexBadge'::text - 'metaLine'::text - 'modalAriaLabel'::text
 WHERE page = 'careers' AND slot = 'jobCards'
   AND extra ?| ARRAY['indexBadge', 'metaLine', 'modalAriaLabel'];

UPDATE content_blocks SET extra = extra - 'supportingCopy'::text
 WHERE page = 'home' AND slot = 'hero' AND extra ? 'supportingCopy';

UPDATE content_blocks SET extra = extra - 'resumeInstruction'::text
 WHERE page = 'careers' AND slot = 'apply' AND extra ? 'resumeInstruction';

UPDATE content_blocks SET extra = extra - 'asideTitle'::text
 WHERE page = 'careers' AND slot = 'openings' AND extra ? 'asideTitle';

-- An `extra` emptied by the above becomes NULL rather than `{}`, so the API
-- omits the key entirely instead of emitting an empty object.
UPDATE content_blocks SET extra = NULL
 WHERE extra IS NOT NULL AND extra = '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 4. ✅ D-041 — the founder portrait is not a content row.
-- ---------------------------------------------------------------------------
--
-- Its `src` is `site.founder.photo` and its alt is
-- `${honorific} ${name}, ${role}`, which the immutable snapshot records as an
-- expression in `altJsx`. `Hero.tsx` renders the portrait from
-- `site_settings`, so this row appeared on no page while remaining editable in
-- the admin.
--
-- Matched on the `label` the derivation assigns ('portrait'), not on sort_order
-- or media id: the label is the role the layout distinguishes by, and it is the
-- only stable identifier that survives a media re-upload.
--
-- 🔒 The `media` row it points at is NOT deleted — the same Cloudinary resource
-- backs `site_settings.founder_photo_media_id`. Removing it would break the
-- portrait everywhere. `media` stays at 26.

DELETE FROM content_block_items i
 USING content_blocks b
 WHERE b.id = i.block_id
   AND b.page = 'home' AND b.slot = 'hero'
   AND i.group_key = 'images'
   AND i.label = 'portrait';

COMMENT ON TABLE content_block_items IS
  '17 seed rows (D-024 as corrected by D-041): home.hero.images 1, '
  'home.intro.images 2, home.intro.bulletList 4, home.appointmentBand.rows 3, '
  'serviceDetail.metaRow.items 3, contact.infoCards.items 4. The founder '
  'portrait is NOT a row — it is derived from site_settings.';
