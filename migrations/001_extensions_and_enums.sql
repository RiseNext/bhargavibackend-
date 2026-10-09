-- M001 · extensions and enums
--
-- Depends on: nothing.  Tables created: none.
-- Rollback: drop the types (safe — nothing references them yet).
--
-- `pgcrypto` is here for `gen_random_uuid()` ONLY. Field encryption is
-- deliberately NOT done in SQL (D-035): a pgcrypto call puts the key into the
-- statement text and therefore into query logs. `citext` gives case-insensitive
-- uniqueness for email addresses without a functional index on every lookup.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Shared trigger function
-- ---------------------------------------------------------------------------
-- `updated_at` is not cosmetic here: it becomes `sitemap.xml`'s `lastModified`,
-- replacing the frontend's current meaningless `new Date()`. A trigger makes it
-- true for every write path, including a manual SQL fix, rather than relying on
-- every query remembering to set it.

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

-- 🔴 Only two values, deliberately. /api/contact accepts five payload kinds but
-- writes to three tables: `career` goes to `applications` and `newsletter` to
-- `newsletter_subscribers`. Adding either here would create two homes for the
-- same record (DB design §2.1 dispatch rule).
CREATE TYPE submission_kind AS ENUM ('appointment', 'contact');

CREATE TYPE submission_status AS ENUM ('new', 'contacted', 'closed');

CREATE TYPE application_status AS ENUM (
  'new', 'screening', 'interviewed', 'rejected', 'hired'
);

CREATE TYPE resume_method AS ENUM ('upload', 'email');

CREATE TYPE newsletter_status AS ENUM ('subscribed', 'unsubscribed');

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------

CREATE TYPE employment_type AS ENUM ('full_time', 'part_time');

CREATE TYPE testimonial_source AS ENUM ('google', 'direct', 'other');

-- Editorial state, never exposed publicly.
CREATE TYPE copy_status AS ENUM ('source', 'rewrite');

CREATE TYPE blog_status AS ENUM ('draft', 'published');

CREATE TYPE blog_block_type AS ENUM (
  'text', 'heading', 'image', 'youtube', 'quote', 'list'
);

CREATE TYPE content_collection AS ENUM (
  'why_choose_us', 'process', 'philosophy', 'achievements', 'about_story'
);

CREATE TYPE content_block_item_type AS ENUM (
  'text', 'label_value', 'link_row', 'image', 'card'
);

-- ---------------------------------------------------------------------------
-- Platform
-- ---------------------------------------------------------------------------

CREATE TYPE media_resource_type AS ENUM ('image', 'raw');

-- `authenticated` is Cloudinary's private delivery type. Resumes are always
-- authenticated + raw, and never get a stored public URL (D-018).
CREATE TYPE media_delivery_type AS ENUM ('upload', 'authenticated');

CREATE TYPE media_visibility AS ENUM ('public', 'private');

-- `admin` is the only role v1 needs. The type exists so adding `editor` later
-- is an ALTER TYPE rather than a table migration (DB design §12.9).
CREATE TYPE admin_role AS ENUM ('admin');
