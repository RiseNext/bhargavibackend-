-- 015 — the privacy page's SEO row and its thirteen content blocks (E17 / D-021).
--
-- 🔴 WHAT THIS FIXES. Production was seeded on 2026-10-08, BEFORE E17 added the
-- privacy page. The result is a database that two parts of this codebase already
-- disagree with:
--
--   · `scripts/seed/snapshot.ts#pageMetaSeeds()` returns TEN rows — the nine
--     routes present at frontend 2fdf32a plus `privacy` — and
--     `scripts/seed.ts` asserts `page_meta: 10`. Production holds NINE.
--   · `scripts/seed/stage-s3.ts` seeds the thirteen `page = 'privacy'`
--     `content_blocks` rows and asserts they are present. Production holds
--     NONE, so `GET /api/content-blocks?page=privacy` returns an empty list and
--     `privacyReadiness().exists` is false.
--
-- The visible consequence is in the frontend's content gate: check 11 of
-- `scripts/verify-content-switch.mjs` requires ten `page-meta` entries, so a
-- regeneration from production fails there.
--
-- Re-running the seed stages is the wrong instrument. S1 and S3 are declarative
-- reconcilers — they `ON CONFLICT (id) DO UPDATE` every row they own, which
-- would overwrite any administrator edit made since the seed. This migration is
-- the targeted alternative: it adds only the rows that are missing.
--
-- 🔴 ADDITIVE ONLY, BY CONSTRUCTION.
--   · No DDL. No UPDATE. No DELETE. Nothing existing is read for modification.
--   · Both inserts are `ON CONFLICT DO NOTHING` with NO conflict target, so
--     they yield to the primary key AND to `page_meta_page_key` /
--     `content_blocks_page_slot_key`. A row that already exists — seeded, or
--     since edited by an administrator — is left exactly as it is.
--   · The primary keys are the same deterministic UUIDv5 values the seed would
--     compute (`pageMetaId('privacy')`, `contentBlockId('privacy', slot)`), so a
--     later S1 or S3 run matches these rows on `id` instead of colliding on the
--     unique index.
--
-- 🔴 NOTHING HERE IS INVENTED, AND THE POLICY DOES NOT GO LIVE.
-- The prose is the approved draft (`docs/PRIVACY-POLICY-DRAFT.md`), derived
-- mechanically from `scripts/seed/privacy-blocks.ts` by
-- `scripts/emit-migration-015.mts`. 8 of the 13 slots still carry the literal
-- `UNKNOWN — CLIENT INPUT REQUIRED`, one per unresolved legal or
-- business fact, because only the clinic can state them (D-021, blocker B10).
-- While any marker survives, `emitPageCopy` withholds the ENTIRE privacy page
-- from the generated content, `privacyPublished` stays `false`, and `/privacy`
-- answers not-found with no footer link and no sitemap entry. The page_meta row
-- is therefore metadata for a page that is deliberately not yet published.
--
-- The `page_meta` row carries a canonical path only: its title and description
-- are NULL so `metadataFor()` falls back to the site-wide template rather than
-- to SEO text nobody wrote.
--
-- Rollback: delete the fourteen rows this inserts and the ledger row.
--   DELETE FROM content_blocks WHERE page = 'privacy';
--   DELETE FROM page_meta      WHERE page = 'privacy';
--   DELETE FROM _migrations    WHERE version = '015';
-- Safe because every one of them is created here; none is referenced by a
-- foreign key, and `content_block_items` has no privacy rows.

-- ---------------------------------------------------------------------------
-- 1. page_meta — the privacy route's SEO row.
-- ---------------------------------------------------------------------------

INSERT INTO page_meta (id, page, title, description, canonical, og_media_id, noindex)
VALUES (
  '01aa5cf3-a490-5c25-b32b-7cc2c7965f16',
  'privacy',
  NULL,
  NULL,
  '/privacy',
  NULL,
  false
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. content_blocks — the 13 privacy slots.
-- ---------------------------------------------------------------------------
-- Every `cta_*` column stays NULL: a legal page has no call to action, which
-- also satisfies `content_blocks_cta_label_needs_href` (migration 013) and
-- `content_blocks_cta2_needs_cta` without further thought.
--
-- The rows actually inserted are captured so the marker assertion below can be
-- scoped to THEM. Asserting over the whole privacy page instead would make this
-- migration fail the day the client resolves a fact — the opposite of the
-- failure it is meant to catch.

CREATE TEMP TABLE _m015_inserted (id uuid NOT NULL) ON COMMIT DROP;

WITH ins AS (
  INSERT INTO content_blocks (id, page, slot, label, title, lead, body, extra)
  VALUES
  (
    '437a8968-9939-5d20-853c-90d4fb64923a',
    'privacy',
    'intro',
    'Privacy',
    'Privacy Policy',
    'This policy explains what this website collects when you contact us, why we collect it, and what we do with it. It covers this website only.',
    '["We ask for as little as possible, and we never sell your information or share it for advertising."]'::jsonb,
    '{"lastUpdated":"UNKNOWN — CLIENT INPUT REQUIRED (date of publication)"}'::jsonb
  ),
  (
    '53aa50fd-3901-59e3-9833-24d9ca38917d',
    'privacy',
    'collect',
    'Section 1',
    'Information we collect',
    'Only what you type into a form, plus the minimum our systems record automatically.',
    '["When you request an appointment: your name, phone number, an optional email address, your preferred branch, the therapy you are interested in, an optional preferred date and time, and an optional description of what you would like help with.","When you send a general enquiry: your name, phone number, an optional email address and your message.","When you apply for a job: your name, phone number, an optional email address, the role you are applying for, your experience, a short note about yourself, and — if you choose to upload one — your CV. You may instead email your CV to us separately.","Automatically: the internet address your request came from and your browser''s identification string, kept so we can recognise automated abuse of our forms.","We do not ask for your date of birth, your identity-document numbers, your payment details or your medical records through this website.","UNKNOWN — CLIENT INPUT REQUIRED (whether website analytics are used, and if so which — this section must say so before any analytics are added)"]'::jsonb,
    NULL
  ),
  (
    '3c861f5f-9416-513d-8b9e-cea9900c09ad',
    'privacy',
    'why',
    'Section 2',
    'Why we collect it',
    'To answer you, and to run the clinic''s own records. Nothing else.',
    '["To contact you about the appointment or enquiry you submitted, using the name, phone number and email address you gave us.","To prepare for your visit, using the therapy and timing you asked for.","To assess a job application, using the details and CV you sent.","To protect the forms from automated abuse, using the technical details above.","We do not use your enquiry details for marketing, and we do not add you to a mailing list because you booked an appointment.","UNKNOWN — CLIENT INPUT REQUIRED (whether the clinic wishes to state a specific legal basis for processing)"]'::jsonb,
    NULL
  ),
  (
    '7d6efa58-f416-557b-98f7-d076c152f01e',
    'privacy',
    'health',
    'Section 3',
    'Health and symptom information',
    'If you describe a symptom or a condition in the appointment form, that is health information, and we treat it with particular care.',
    '["You decide how much to share. The description field is optional — you can leave it blank, or write only a few words, and still request an appointment.","What you write is stored encrypted, and it is readable only by signing in to our administration system. This website sends no email to anyone, so your description is never placed in an email by us.","If you choose to continue on WhatsApp, the details you send there go to the clinic''s own WhatsApp number. That is your choice and it is not required.","Only authorised clinic staff can view enquiry details, and every time the description is opened it is recorded.","Please do not send detailed medical records through this website. Bring them to your appointment instead."]'::jsonb,
    NULL
  ),
  (
    '997d4a53-e156-5ea5-b953-8baaa2c28e38',
    'privacy',
    'careers',
    'Section 4',
    'Careers and resumes',
    'Your CV is kept privately and is never published.',
    '["A CV you upload is stored privately. It has no public web address, and it cannot be found by search engines.","Clinic staff open it through a temporary link that expires shortly after it is created, and each access is recorded.","This website sends no email, so your CV is never emailed by us to anyone.","If you choose to email your CV instead, we give you a reference number so we can match your document to your application.","We use your application to assess you for the role you applied for, and for other roles at the clinic if you have asked us to keep you in mind.","UNKNOWN — CLIENT INPUT REQUIRED (how long unsuccessful applications and CVs should be kept)"]'::jsonb,
    NULL
  ),
  (
    '0eb24606-3588-545c-864d-3bc3c360fd4b',
    'privacy',
    'thirdParties',
    'Section 5',
    'WhatsApp and other services we rely on',
    'A few services help us run this website. We keep the list short.',
    '["WhatsApp: when you choose to continue on WhatsApp, your message is handled by WhatsApp under its own privacy terms, which we do not control. WhatsApp is optional — you can call the clinic or email us instead.","We also rely on service providers to host this website, to store its database, and to store images and uploaded CVs. They process this information on our instructions only.","UNKNOWN — CLIENT INPUT REQUIRED (whether the clinic wishes to name its hosting, database and file-storage providers, and the countries their data is held in)"]'::jsonb,
    NULL
  ),
  (
    'bebccd34-0e68-5efd-ab13-9fcfb4d3ecfb',
    'privacy',
    'storage',
    'Section 6',
    'How we store and protect your information',
    'Access is limited, encrypted where it matters, and recorded.',
    '["Enquiries are stored in a private database that is not reachable from the public internet.","The description you write in the appointment form is encrypted before it is stored, so it cannot be read directly from the database.","Uploaded CVs are stored privately with no public address.","Only authorised clinic staff have accounts, each sign-in is protected, and views of enquiry descriptions and CV downloads are recorded."]'::jsonb,
    NULL
  ),
  (
    '478d1deb-2924-5a37-9635-8407ae6cad0a',
    'privacy',
    'retention',
    'Section 7',
    'How long we keep it',
    'Only as long as we need it.',
    '["Appointment requests and enquiries are kept while we are in contact with you and for a period afterwards for the clinic''s own records.","Job applications and CVs are kept for the role you applied for, and longer only if you asked us to keep you in mind.","Records of staff access are kept so that access to health information remains accountable.","UNKNOWN — CLIENT INPUT REQUIRED (the final retention period for each of the three categories above)"]'::jsonb,
    NULL
  ),
  (
    '0ac97436-eb22-5af5-8cf3-625584cc585a',
    'privacy',
    'rights',
    'Section 8',
    'Your choices and rights',
    'You can ask us what we hold about you, and ask us to correct or delete it.',
    '["Write to us at the address in the Contact section to ask for a copy of what we hold, to ask us to correct something, to ask us to delete your enquiry, or to ask us to stop contacting you.","Please tell us the phone number or email address you used, so we can find your record.","We will respond as soon as we reasonably can.","UNKNOWN — CLIENT INPUT REQUIRED (which data-protection law the clinic is subject to, and whether to set out the specific statutory rights it grants)"]'::jsonb,
    NULL
  ),
  (
    '8797f08a-1897-5894-ad84-c3a729686006',
    'privacy',
    'consent',
    'Section 9',
    'Consent',
    'The appointment form asks you to confirm that we may contact you.',
    '["Ticking that box means you agree that we may call or message you about the enquiry you submitted.","It does not sign you up to anything else, and you can ask us to stop at any time."]'::jsonb,
    NULL
  ),
  (
    '379e26cf-053e-5066-bdde-299331c8bfe2',
    'privacy',
    'children',
    'Section 10',
    'Children',
    'This website is intended to be used by adults.',
    '["If you are booking on behalf of a child, please use your own contact details.","If you believe a child has sent us information directly, contact us and we will remove it."]'::jsonb,
    NULL
  ),
  (
    'bab68e4f-19c9-57e5-ba73-90788bed4963',
    'privacy',
    'changes',
    'Section 11',
    'Changes to this policy',
    'If this policy changes, the date at the top changes with it.',
    '["We may update this policy as the website changes. The current version is always the one on this page."]'::jsonb,
    NULL
  ),
  (
    '84f1178b-a385-5ed2-a8a6-abe6d7dba3b5',
    'privacy',
    'contact',
    'Section 12',
    'Contact us',
    'For anything about this policy, or about information we hold about you.',
    '["UNKNOWN — CLIENT INPUT REQUIRED (the registered business or legal entity name that this policy is issued by)","UNKNOWN — CLIENT INPUT REQUIRED (the clinic''s full postal address for privacy correspondence)","UNKNOWN — CLIENT INPUT REQUIRED (any business registration number the clinic wishes to publish)"]'::jsonb,
    NULL
  )
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO _m015_inserted (id) SELECT id FROM ins;

-- ---------------------------------------------------------------------------
-- 3. Guards — fail the whole migration rather than leave a half-built page.
-- ---------------------------------------------------------------------------
-- Each assertion is re-run safe: it describes the state this migration is
-- responsible for, never the state an administrator is allowed to change.

DO $m015$
DECLARE
  meta_rows      integer;
  privacy_blocks integer;
  missing        text;
  inserted       integer;
  inserted_marked integer;
BEGIN
  SELECT count(*) INTO meta_rows FROM page_meta WHERE page = 'privacy';
  IF meta_rows <> 1 THEN
    RAISE EXCEPTION
      'page_meta should hold exactly 1 privacy row after migration 015, found %', meta_rows;
  END IF;

  SELECT count(*) INTO privacy_blocks FROM content_blocks WHERE page = 'privacy';
  IF privacy_blocks <> 13 THEN
    RAISE EXCEPTION
      'content_blocks should hold exactly 13 privacy rows after migration 015, found %',
      privacy_blocks;
  END IF;

  -- Present AND correctly keyed: a slot typo would show up here as a missing
  -- expected slot rather than as a page that renders with a hole in it.
  SELECT string_agg(expected.slot, ', ' ORDER BY expected.slot) INTO missing
    FROM (VALUES
      ('intro'),
      ('collect'),
      ('why'),
      ('health'),
      ('careers'),
      ('thirdParties'),
      ('storage'),
      ('retention'),
      ('rights'),
      ('consent'),
      ('children'),
      ('changes'),
      ('contact')
         ) AS expected(slot)
   WHERE NOT EXISTS (
     SELECT 1 FROM content_blocks b WHERE b.page = 'privacy' AND b.slot = expected.slot
   );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'privacy content_blocks are missing slot(s): %', missing;
  END IF;

  -- 🔴 The unresolved client facts must have survived verbatim. A missing
  -- marker would mean a legal or business fact was invented or silently
  -- dropped, and the policy would become publishable without the clinic ever
  -- having stated it.
  SELECT count(*) INTO inserted FROM _m015_inserted;

  IF inserted = 13 THEN
    SELECT count(*) INTO inserted_marked
      FROM content_blocks b
      JOIN _m015_inserted i ON i.id = b.id
     WHERE (coalesce(b.label, '') || coalesce(b.title, '') || coalesce(b.lead, '')
            || coalesce(b.body::text, '') || coalesce(b.extra::text, ''))
           LIKE '%' || 'UNKNOWN — CLIENT INPUT REQUIRED' || '%';

    IF inserted_marked <> 8 THEN
      RAISE EXCEPTION
        'expected 8 of the newly inserted privacy slots to still carry "%", found %',
        'UNKNOWN — CLIENT INPUT REQUIRED', inserted_marked;
    END IF;

    RAISE NOTICE
      'migration 015: inserted % privacy content_blocks, % still awaiting client input',
      inserted, inserted_marked;
  ELSIF inserted = 0 THEN
    RAISE NOTICE 'migration 015: privacy content already present — nothing inserted';
  ELSE
    RAISE NOTICE
      'migration 015: inserted % of 13 privacy content_blocks; the rest already existed',
      inserted;
  END IF;
END $m015$;

COMMENT ON TABLE page_meta IS
  'Per-page SEO. TEN rows: the nine routes present at frontend 2fdf32a plus '
  '`privacy`, whose row is canonical-only so the title and description fall '
  'back to the site-wide template (E17, migration 015). `/services/[slug]` is a '
  'template fed by `services.seo_*` and `not-found` exports no metadata, so '
  'neither has a row.';
