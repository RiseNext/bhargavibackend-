-- M010 · relax the phone-format CHECK on the two lead tables
--
-- Depends on: M006.  Seed: none.  Rollback: forward-only — re-add by a new
-- migration if the decision ever changes.
--
-- WHY. M006 constrained `submissions.phone_e164` and `applications.phone_e164`
-- to a strict E.164 pattern. That constraint is wrong for a LEAD table, and it
-- conflicts with the project's first principle.
--
-- The frozen `/api/contact` contract requires `phone` to be NON-EMPTY but does
-- NOT validate its format — the live stub accepts any non-blank string and
-- returns 200. A visitor who mistypes their number must still produce a stored
-- lead: the WhatsApp hand-over has already delivered their enquiry to the
-- clinic, and the row is what stops the lead being lost. A CHECK violation here
-- would throw away exactly the record the system exists to keep.
--
-- So: `NOT NULL` stays (a lead with no phone is unreachable), the strict pattern
-- goes, and a non-blank check replaces it. `phone_raw` continues to hold the
-- submitted string verbatim, and the admin inbox shows both — so an
-- unnormalisable number is visible and correctable rather than silently dropped.
--
-- The strict pattern REMAINS on `branches.phone_e164` / `whatsapp_e164`, where
-- the values are admin-entered configuration that drives `tel:` and WhatsApp
-- links and really must be well-formed.

ALTER TABLE submissions
  DROP CONSTRAINT submissions_phone_e164_format,
  ADD CONSTRAINT submissions_phone_not_blank
    CHECK (length(trim(phone_e164)) > 0);

ALTER TABLE applications
  DROP CONSTRAINT applications_phone_e164_format,
  ADD CONSTRAINT applications_phone_not_blank
    CHECK (length(trim(phone_e164)) > 0);
