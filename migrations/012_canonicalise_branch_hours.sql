-- 012 — canonicalise `branches.hours` to the numeric day model, and enforce it.
--
-- 🔴 WHY THIS EXISTS. `branches.hours` held TWO incompatible encodings of the
-- same fact:
--
--   · the seed wrote `{"day": "monday", ...}`  (a day-NAME string)
--   · `HoursDay` (src/lib/settings/resolve.ts) and the admin write schema
--     (src/lib/admin/branches.ts) use `{"day": 1, ...}` (0 = Sunday … 6 =
--     Saturday, matching Date.prototype.getDay())
--
-- Nothing reconciled them, so the FIRST time an administrator saved opening
-- hours — the very thing D-005 exists to allow — that branch silently switched
-- encoding. `isOutsideHours()` matched only day names, so from that moment every
-- appointment at every time was flagged outside opening hours. It failed
-- silently because the public pages render through the generator, which already
-- tolerated both forms.
--
-- The readers were made tolerant in the same change as this migration, but
-- tolerant readers only contain the damage. Two encodings for one fact is the
-- defect; this migration removes the second one and makes it unrepresentable.
--
-- CANONICAL FORM: numeric. Chosen because it is what the runtime type and the
-- only remaining WRITE path already use, and because it is directly comparable
-- with `getDay()` — the day-name form required a lookup table in every consumer.
--
-- 🔴 MEANING IS PRESERVED EXACTLY. Only the `day` key's representation changes;
-- `windows` (and therefore every opening and closing time) is copied verbatim,
-- and the original array ORDER is preserved via WITH ORDINALITY so that nothing
-- which happens to depend on element order can shift. NULL stays NULL —
-- Bowenpally's hours are genuinely unknown (D-029) and must not be invented.

-- ---------------------------------------------------------------------------
-- 1. Convert any day-name rows to the numeric model.
-- ---------------------------------------------------------------------------

UPDATE branches AS b
SET hours = (
  SELECT jsonb_agg(
           jsonb_set(
             elem,
             '{day}',
             to_jsonb(
               CASE lower(elem ->> 'day')
                 WHEN 'sunday'    THEN 0
                 WHEN 'monday'    THEN 1
                 WHEN 'tuesday'   THEN 2
                 WHEN 'wednesday' THEN 3
                 WHEN 'thursday'  THEN 4
                 WHEN 'friday'    THEN 5
                 WHEN 'saturday'  THEN 6
               END
             )
           )
           ORDER BY ord
         )
    FROM jsonb_array_elements(b.hours) WITH ORDINALITY AS t(elem, ord)
)
WHERE b.hours IS NOT NULL
  -- Only rows that actually carry a string day, so re-running is a no-op and
  -- an already-numeric row is never rewritten.
  AND EXISTS (
    SELECT 1
      FROM jsonb_array_elements(b.hours) AS e
     WHERE jsonb_typeof(e -> 'day') = 'string'
  );

-- 🔴 Refuse to continue if any row still holds a non-numeric or out-of-range
-- day. That means either an unrecognised day name (the CASE above would have
-- produced NULL) or a shape nothing in the codebase writes. Failing here rolls
-- the whole migration back, which is far better than installing the constraint
-- below against data that cannot satisfy it.
DO $$
DECLARE
  bad integer;
BEGIN
  SELECT count(*) INTO bad
    FROM branches b, jsonb_array_elements(b.hours) AS e
   WHERE b.hours IS NOT NULL
     AND (
       jsonb_typeof(e -> 'day') <> 'number'
       OR (e ->> 'day')::numeric NOT BETWEEN 0 AND 6
       OR (e ->> 'day')::numeric <> trunc((e ->> 'day')::numeric)
     );

  IF bad > 0 THEN
    RAISE EXCEPTION
      'branches.hours still has % element(s) whose day is not an integer 0-6; '
      'canonicalisation did not cover every stored form', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Make the second encoding unrepresentable.
-- ---------------------------------------------------------------------------

-- A CHECK cannot contain a subquery, so the per-element test lives in an
-- IMMUTABLE function. It is deliberately strict about `day` and deliberately
-- permissive about everything else: window times are already validated by the
-- application's zod schema, and duplicating that here would mean two places to
-- keep in step — which is the exact mistake this migration is undoing.
CREATE OR REPLACE FUNCTION branches_hours_is_canonical(hours jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT hours IS NULL
      OR (
        jsonb_typeof(hours) = 'array'
        AND NOT EXISTS (
          SELECT 1
            FROM jsonb_array_elements(hours) AS e
           WHERE jsonb_typeof(e) <> 'object'
              -- 0 = Sunday … 6 = Saturday, and an integer, not 1.5 or "1".
              OR jsonb_typeof(e -> 'day') <> 'number'
              OR (e ->> 'day')::numeric NOT BETWEEN 0 AND 6
              OR (e ->> 'day')::numeric <> trunc((e ->> 'day')::numeric)
              OR jsonb_typeof(e -> 'windows') <> 'array'
        )
      );
$$;

COMMENT ON FUNCTION branches_hours_is_canonical(jsonb) IS
  'True when branches.hours is NULL or an array whose every element has an '
  'integer `day` in 0..6 (0 = Sunday, matching Date.prototype.getDay()) and an '
  'array `windows`. Exists so the day-name encoding the seed once wrote cannot '
  'come back — see migration 012.';

ALTER TABLE branches
  ADD CONSTRAINT branches_hours_canonical_day
  CHECK (branches_hours_is_canonical(hours));

COMMENT ON COLUMN branches.hours IS
  'Per-day, multi-window opening hours (P-008). `day` is an INTEGER 0..6 with '
  '0 = Sunday, matching Date.prototype.getDay(); enforced by '
  'branches_hours_canonical_day. NULL means the hours are genuinely unknown '
  '(Bowenpally, D-029) and must never be invented. The frontend''s {days, time} '
  'display shape is produced by the generator (D-028), never stored.';
