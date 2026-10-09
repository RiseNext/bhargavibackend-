-- M003 · media
--
-- Depends on: M002 (uploaded_by → admin_users).  Seed: stage S2 (Phase 6) —
-- 26 rows, after the assets are in Cloudinary.
-- Rollback: drop the table.
--
-- One table serves both site media and resumes, separated by
-- visibility + delivery_type + resource_type (D-018).
--
-- Deliberately absent: `storage_key` (Cloudinary's public_id IS the key),
-- `checksum_sha256` (etag + bytes serve the integrity role) and `mime`
-- (resource_type + format is Cloudinary's own model; two sources of truth for
-- content type is how a mismatch gets missed).

CREATE TABLE media (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL DEFAULT 'cloudinary',
  -- UUID-based and non-guessable: chosen by the backend, never derived from the
  -- uploaded filename.
  public_id         text NOT NULL,
  resource_type     media_resource_type NOT NULL,
  delivery_type     media_delivery_type NOT NULL,
  visibility        media_visibility NOT NULL,
  -- Verified server-side after upload through the Admin API, never trusted from
  -- the client.
  format            text NOT NULL,
  bytes             int NOT NULL,
  width             int,
  height            int,
  -- 🔴 NULL for private resources, and the CHECK below enforces it. Storing a
  -- resume URL would create a durable pointer to personal data; private
  -- delivery uses signed URLs with a ≤5 min TTL generated per request.
  secure_url        text,
  version           text,
  etag              text,
  -- Display only. Never used as a public_id or a path component.
  original_filename text,
  alt_default       text,
  folder            text,
  -- NULL for visitor-uploaded resumes — there is no admin actor for those.
  uploaded_by       uuid REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,

  CONSTRAINT media_bytes_positive CHECK (bytes > 0),
  CONSTRAINT media_dimensions_sane CHECK (
    (width IS NULL OR width > 0) AND (height IS NULL OR height > 0)
  ),
  -- visibility mirrors delivery_type for query convenience; the CHECK stops the
  -- two drifting, which would make "list the private files" quietly wrong.
  CONSTRAINT media_visibility_matches_delivery CHECK (
    (delivery_type = 'upload' AND visibility = 'public')
    OR (delivery_type = 'authenticated' AND visibility = 'private')
  ),
  -- 🔴 The structural guarantee behind risk 10 (resume publicly reachable).
  CONSTRAINT media_private_has_no_public_url CHECK (
    visibility = 'public' OR secure_url IS NULL
  )
);

CREATE UNIQUE INDEX media_public_id_key ON media (public_id);
CREATE INDEX media_resource_created_idx ON media (resource_type, created_at DESC);
CREATE INDEX media_visibility_idx ON media (visibility);
CREATE INDEX media_folder_idx ON media (folder);
