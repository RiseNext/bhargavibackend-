-- M006 · leads: submissions, applications, newsletter_subscribers
--
-- Depends on: M003 (media), M004 (branches), M005 (services, jobs).
-- Seed: none — these tables hold real patient and applicant data.
-- Rollback: 🔴 THIS MIGRATION IS THE POINT OF NO RETURN. Once one real lead
--           exists, a down-migration is data loss. Recovery is PITR plus the
--           SEPARATELY backed-up encryption key (D-035) — a restore without the
--           key yields unreadable messages.
--
-- 🔴 No FK from content to a lead is ever ON DELETE CASCADE. Deleting a service
-- must never delete the enquiries about it, so every such FK is SET NULL and is
-- paired with an immutable snapshot column (`service_slug`, `branch_label`,
-- `role_label`).
--
-- 🔐 D-035: there is no plaintext `message` column and there never was, so there
-- is no backfill and no drop-column release. That is precisely why the
-- encryption decision had to be settled before this migration.

-- ---------------------------------------------------------------------------
-- submissions — the clinic's patient pipeline, the highest-value data here
-- ---------------------------------------------------------------------------

CREATE TABLE submissions (
  -- 🔴 D-035: the APPLICATION generates this (`crypto.randomUUID()`) and passes
  -- it in the INSERT, because the AAD binds the ciphertext to the id and the id
  -- must therefore be known before encryption. The default remains as a safety
  -- net for any row inserted outside the application.
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human-quotable over the phone: BHW-E-2026-0042.
  reference        text NOT NULL,
  kind             submission_kind NOT NULL,

  -- Null for `contact` (that form has no branch field) and for an unmatched
  -- value. SET NULL, never CASCADE.
  branch_id        uuid REFERENCES branches (id) ON DELETE SET NULL,
  -- Immutable snapshot of the submitted string, so a branch rename cannot
  -- rewrite history (R-11).
  branch_label     text,

  name             text NOT NULL,
  phone_e164       text NOT NULL,   -- normalised
  phone_raw        text NOT NULL,   -- as submitted, for audit
  email            text,

  -- Snapshot string, deliberately not an FK: a service may be renamed or
  -- deleted and the enquiry must still say what it was about.
  service_slug     text,
  service_id       uuid REFERENCES services (id) ON DELETE SET NULL,

  -- Parsed from the naive `datetime` input, interpreted as Asia/Kolkata,
  -- stored UTC.
  preferred_at     timestamptz,
  preferred_at_raw text,
  -- A warning flag for the admin only. NEVER a rejection reason — the clinic
  -- would rather have the lead.
  outside_hours    boolean NOT NULL DEFAULT false,

  -- 🔐 D-035. Envelope: [0x01][keyVerLen][keyVer][12B nonce][16B tag][ciphertext].
  -- AAD = "submissions|" || id || "|message|v1".
  message_encrypted bytea,
  -- Lets the inbox show "has a message" and the dashboard count one, without
  -- decrypting anything. Also stays true when encryption FAILED — the row is
  -- persisted regardless, because a lost lead is the worst outcome in this
  -- project and the text already reached the clinic over WhatsApp.
  message_present   boolean NOT NULL DEFAULT false,

  consent          boolean NOT NULL DEFAULT false,
  -- Snapshot of the exact wording agreed to, for a lawful-basis audit.
  consent_text     text,

  status           submission_status NOT NULL DEFAULT 'new',
  admin_notes      text,

  -- Best-effort: did the frontend manage to open WhatsApp?
  whatsapp_handover boolean,

  ip               inet,
  user_agent       text,
  -- Logged rather than discarded, so the filter can be tuned against real
  -- traffic instead of guesses.
  honeypot_tripped boolean NOT NULL DEFAULT false,
  source_page      text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Retention marker, computed on status change so the purge job is a single
  -- indexed scan.
  purge_after      timestamptz,

  CONSTRAINT submissions_reference_format CHECK (reference ~ '^BHW-[A-Z]-[0-9]{4}-[0-9]{4,}$'),
  CONSTRAINT submissions_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT submissions_phone_e164_format CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT submissions_name_length CHECK (length(name) <= 200),
  -- A present message with no ciphertext is the explicit encryption-failure
  -- state. Ciphertext with message_present = false, however, is incoherent and
  -- would hide a real message from the inbox.
  CONSTRAINT submissions_ciphertext_implies_present CHECK (
    message_encrypted IS NULL OR message_present
  )
);

CREATE UNIQUE INDEX submissions_reference_key ON submissions (reference);
CREATE INDEX submissions_status_created_idx ON submissions (status, created_at DESC);
CREATE INDEX submissions_kind_created_idx ON submissions (kind, created_at DESC);
CREATE INDEX submissions_branch_status_created_idx ON submissions (branch_id, status, created_at DESC);
CREATE INDEX submissions_created_idx ON submissions (created_at DESC);
-- "Has this person enquired before?" — the one lookup the clinic actually does.
CREATE INDEX submissions_phone_idx ON submissions (phone_e164);
CREATE INDEX submissions_purge_idx ON submissions (purge_after) WHERE purge_after IS NOT NULL;

CREATE TRIGGER submissions_set_updated_at
BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------
-- Separate from `submissions` because the lifecycle, fields, retention class
-- and notification recipient all differ: employment data, not a patient enquiry.
--
-- D-014 upload lifecycle: the row is inserted BEFORE any file exists, then a
-- signature is issued, then the browser uploads directly to Cloudinary, then the
-- backend verifies server-side. The application is never lost because a file
-- failed.

CREATE TABLE applications (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Links the email-resume path to the record: the applicant quotes it.
  reference                   text NOT NULL,
  job_id                      uuid REFERENCES jobs (id) ON DELETE SET NULL,
  -- Immutable snapshot of the submitted role string.
  role_label                  text NOT NULL,

  name                        text NOT NULL,
  phone_e164                  text NOT NULL,
  phone_raw                   text NOT NULL,
  -- Conditionally required: I-5 requires it when "I'll email it instead" is
  -- chosen, because without an address the clinic cannot correlate the CV.
  email                       text,
  experience                  text,
  -- "Why you?" — stays PLAINTEXT. Employment data, legitimately searched by
  -- staff. Stated explicitly so nobody encrypts it by symmetry with D-035.
  message                     text NOT NULL,

  resume_method               resume_method NOT NULL,
  resume_media_id             uuid REFERENCES media (id) ON DELETE SET NULL,
  -- The four resume states the admin sees at a glance (D-014 + D-031).
  resume_upload_authorised_at timestamptz,
  resume_confirmed_at         timestamptz,
  -- ✅ D-031: distinguishes a REJECTED upload from an ABANDONED one. Without
  -- these two columns "upload incomplete" cannot tell the admin whether to
  -- chase the applicant or explain a rejection.
  resume_upload_rejected_at   timestamptz,
  resume_rejection_reason     text,
  -- Admin-set when an emailed CV actually arrives.
  resume_received_at          timestamptz,

  status                      application_status NOT NULL DEFAULT 'new',
  admin_notes                 text,
  ip                          inet,
  user_agent                  text,
  honeypot_tripped            boolean NOT NULL DEFAULT false,
  source_page                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  purge_after                 timestamptz,

  CONSTRAINT applications_reference_format CHECK (reference ~ '^BHW-[0-9]{4}-[0-9]{4,}$'),
  CONSTRAINT applications_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT applications_phone_e164_format CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT applications_rejection_reason_known CHECK (
    resume_rejection_reason IS NULL OR resume_rejection_reason IN (
      'format_mismatch', 'magic_bytes_mismatch', 'public_id_mismatch',
      'too_large', 'not_found', 'resource_type_mismatch', 'fetch_failed'
    )
  ),
  -- A confirmed upload must have a file; otherwise "confirmed" means nothing.
  CONSTRAINT applications_confirmed_has_media CHECK (
    resume_confirmed_at IS NULL OR resume_media_id IS NOT NULL
  ),
  -- Confirmed and rejected are terminal and mutually exclusive.
  CONSTRAINT applications_not_both_confirmed_and_rejected CHECK (
    resume_confirmed_at IS NULL OR resume_upload_rejected_at IS NULL
  )
);

CREATE UNIQUE INDEX applications_reference_key ON applications (reference);
CREATE INDEX applications_status_created_idx ON applications (status, created_at DESC);
CREATE INDEX applications_job_idx ON applications (job_id);
-- "Who still owes us a CV?"
CREATE INDEX applications_resume_owing_idx ON applications (resume_method, resume_received_at);
-- Drives the orphaned-upload sweep.
CREATE INDEX applications_orphan_upload_idx ON applications (resume_upload_authorised_at)
  WHERE resume_confirmed_at IS NULL;
CREATE INDEX applications_purge_idx ON applications (purge_after) WHERE purge_after IS NOT NULL;

CREATE TRIGGER applications_set_updated_at
BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- newsletter_subscribers
-- ---------------------------------------------------------------------------
-- ⚠ D-012 — the newsletter is DEFERRED. The table exists because the dispatch
-- rule needs somewhere to put a `newsletter` payload rather than corrupting
-- `submissions`, but no subscriber infrastructure is built: the two public and
-- two admin endpoints are the 4 deferred operations in the 134 total.

CREATE TABLE newsletter_subscribers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- citext makes a repeat subscribe idempotent regardless of casing.
  email             citext NOT NULL,
  status            newsletter_status NOT NULL DEFAULT 'subscribed',
  unsubscribe_token text NOT NULL,
  confirmed_at      timestamptz,
  -- Set, never deleted — it is the proof of opt-out.
  unsubscribed_at   timestamptz,
  ip                inet,
  user_agent        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT newsletter_email_not_blank CHECK (length(trim(email::text)) > 0)
);

CREATE UNIQUE INDEX newsletter_email_key ON newsletter_subscribers (email);
CREATE UNIQUE INDEX newsletter_token_key ON newsletter_subscribers (unsubscribe_token);
CREATE INDEX newsletter_status_created_idx ON newsletter_subscribers (status, created_at DESC);

CREATE TRIGGER newsletter_set_updated_at
BEFORE UPDATE ON newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
