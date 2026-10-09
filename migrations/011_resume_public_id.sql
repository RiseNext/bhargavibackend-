-- 011 — record which Cloudinary public_id a resume upload was authorised for.
--
-- WHY THIS WAS MISSING. Migration 006 defined the rejection reason
-- `public_id_mismatch` and the four resume lifecycle timestamps, but no column
-- in which to keep the id that a mismatch would be measured against. The
-- reason existed; the thing it compares was absent.
--
-- 🔴 WHY IT MATTERS (D-014 + D-031). `/confirm` must verify the asset the
-- SERVER authorised, not one the caller names. Without a stored id the only
-- available check is "does this public_id exist in Cloudinary", which a caller
-- could satisfy by naming somebody else's asset — including another applicant's
-- CV, whose metadata would then be attached to their own application.
--
-- Additive and nullable: every existing row predates the upload flow, and
-- `resume_method = 'email'` rows never acquire one.

ALTER TABLE applications
  ADD COLUMN resume_public_id text;

COMMENT ON COLUMN applications.resume_public_id IS
  'The Cloudinary public_id this application''s resume upload was authorised for. '
  'Set by POST /api/applications/{reference}/upload-signature; /confirm refuses '
  'any other id (rejection reason public_id_mismatch).';

-- An authorised upload must have an id to verify against, and a confirmed one
-- must have had an authorisation. Stated as a constraint so the invariant
-- cannot drift away from the code that depends on it.
ALTER TABLE applications
  ADD CONSTRAINT applications_authorised_has_public_id CHECK (
    resume_upload_authorised_at IS NULL OR resume_public_id IS NOT NULL
  );

-- Lets the confirm path and any orphan sweep find a row by the id Cloudinary
-- reports, without scanning.
CREATE INDEX applications_resume_public_id_idx
  ON applications (resume_public_id)
  WHERE resume_public_id IS NOT NULL;
