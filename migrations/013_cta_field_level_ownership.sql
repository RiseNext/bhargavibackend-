-- 013 — let a CTA have a CODE-OWNED half (PUB-02 field-level ownership).
--
-- 🔴 WHY. Migration 007 enforced "a CTA's label and href are both present or
-- both absent", because a label with no destination renders a dead button and a
-- destination with no label renders nothing. That rule was right for content
-- that is wholly editable.
--
-- The PUB-02 classification found two live CTAs whose LABEL is derived at render
-- time while the destination is ordinary editable copy:
--
--   about.story        label = Consult with {site.founder.name.split(" ")[0]}
--                      href  = /contact
--   home.testimonials  label = All {testimonials.length} reviews
--                      href  = /testimonials
--
-- The derived label must NOT be stored — a frozen "Consult with Anjana" would
-- stop tracking the founder's name, which is exactly the duplication defect
-- `src/lib/hours.ts` exists to prevent. But the href IS real copy, and the
-- instruction is not to discard it merely because its sibling is code-owned.
-- So these rows legitimately hold an href with no label.
--
-- 🔴 WHAT IS AND IS NOT RELAXED.
--
-- The dead-button rule — the one that protects a visitor — is KEPT in full:
-- a label still requires a destination.
--
--     label IS NOT NULL  ⇒  href IS NOT NULL      (kept, both CTAs)
--
-- What is permitted is the reverse: an href with no stored label, because the
-- component supplies the label from code. The database cannot know which
-- fields are code-owned, so it cannot distinguish "label supplied by code" from
-- "label forgotten". That distinction is enforced one level up, by
-- `classifyCtaPair()` in scripts/seed/code-owned-fields.ts, which has the
-- ownership map and REJECTS an href whose label is neither stored nor
-- code-owned. Both gates together are strictly stronger than 007 alone: 007
-- could not reject a stored value that should have been code-owned, and the new
-- gate does.
--
-- `content_blocks_cta2_needs_cta` is NOT touched: a second CTA still requires a
-- first, and that is independent of ownership.

ALTER TABLE content_blocks
  DROP CONSTRAINT content_blocks_cta_is_a_pair,
  DROP CONSTRAINT content_blocks_cta2_is_a_pair;

-- A label always needs a destination. A destination may stand alone, because a
-- code-owned label is supplied by the component.
ALTER TABLE content_blocks
  ADD CONSTRAINT content_blocks_cta_label_needs_href
    CHECK (cta_label IS NULL OR cta_href IS NOT NULL),
  ADD CONSTRAINT content_blocks_cta2_label_needs_href
    CHECK (cta2_label IS NULL OR cta2_href IS NOT NULL);

COMMENT ON COLUMN content_blocks.cta_label IS
  'Button text. NULL when the component supplies it from code — see '
  'scripts/seed/code-owned-fields.ts. A non-NULL label REQUIRES cta_href '
  '(content_blocks_cta_label_needs_href): a label without a destination is a '
  'dead button.';

COMMENT ON COLUMN content_blocks.cta2_label IS
  'Secondary button text. Same rule as cta_label. Both halves of '
  'global.ctaBand.cta2 are code-owned (the phone number), so both are NULL.';
