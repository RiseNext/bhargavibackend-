/**
 * Emits `migrations/015_privacy_page_content.sql` from the TypeScript sources
 * that already own the content.
 *
 * 🔴 WHY A GENERATOR RATHER THAN A HAND-WRITTEN MIGRATION.
 *
 * Migration 015 has to insert thirteen blocks of near-legal prose and a row of
 * SEO metadata. That text already exists, exactly once, in
 * `scripts/seed/privacy-blocks.ts` (transcribed from the approved draft) and
 * `scripts/seed/snapshot.ts#pageMetaSeeds`. Retyping it into SQL would create a
 * second copy of a privacy policy — and this project's own notes say a
 * transcription slip in that text is a legal exposure, not a content bug.
 * `tests/privacy.test.ts` pins the database rows against `PRIVACY_BLOCKS`, so a
 * hand-typed divergence would also break the suite without saying why.
 *
 * So the SQL is DERIVED and committed. Re-running this script against an
 * unchanged `privacy-blocks.ts` must reproduce the committed file byte for byte;
 * `--check` asserts exactly that.
 *
 * ⚠ Once 015 is applied, its checksum is recorded in `_migrations` and the file
 * is history (see `scripts/migrate.ts#assertUnchanged`). Editing
 * `privacy-blocks.ts` afterwards must NOT be followed by re-emitting 015 — it
 * needs a new migration. This script exists to prove the provenance of what was
 * applied, not to keep the migration in step with the seed for ever.
 *
 * Usage:
 *   npx tsx scripts/emit-migration-015.mts            # write the file
 *   npx tsx scripts/emit-migration-015.mts --check     # verify, write nothing
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { contentBlockId, pageMetaId } from "./seed/ids";
import { PRIVACY_BLOCKS, EXPECTED_PRIVACY_SLOTS_WITH_MARKERS } from "./seed/privacy-blocks";
import { pageMetaSeeds } from "./seed/snapshot";
import { UNKNOWN_MARKER } from "../src/lib/content/privacy";

const ROOT = resolve(import.meta.dirname, "..");
const TARGET = resolve(ROOT, "migrations/015_privacy_page_content.sql");

/** SQL string literal, or the bare keyword NULL. Doubles embedded quotes. */
function lit(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

/** A jsonb literal from a JS value, or NULL. */
function jsonbLit(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  return `${lit(JSON.stringify(value))}::jsonb`;
}

function carriesMarker(block: (typeof PRIVACY_BLOCKS)[number]): boolean {
  const haystack = [
    block.label ?? "",
    block.title ?? "",
    block.lead ?? "",
    ...(block.body ?? []),
    block.extra === null ? "" : JSON.stringify(block.extra),
  ].join("\n");
  return haystack.includes(UNKNOWN_MARKER);
}

function build(): string {
  const privacyMeta = pageMetaSeeds().find((p) => p.page === "privacy");
  if (privacyMeta === undefined) {
    throw new Error("pageMetaSeeds() no longer contains a `privacy` row — refusing to emit.");
  }
  if (privacyMeta.title !== null || privacyMeta.description !== null) {
    // The whole point of the row is that no SEO text was invented for it.
    throw new Error(
      "pageMetaSeeds().privacy now carries a title or description. Migration 015 must not " +
        "invent page SEO text; re-examine before emitting.",
    );
  }

  const markerCount = PRIVACY_BLOCKS.filter(carriesMarker).length;
  if (markerCount !== EXPECTED_PRIVACY_SLOTS_WITH_MARKERS) {
    throw new Error(
      `${String(markerCount)} privacy slot(s) carry "${UNKNOWN_MARKER}" but ` +
        `EXPECTED_PRIVACY_SLOTS_WITH_MARKERS is ${String(EXPECTED_PRIVACY_SLOTS_WITH_MARKERS)}. ` +
        "A dropped marker means a client fact was invented. Refusing to emit.",
    );
  }

  const slots = PRIVACY_BLOCKS.map((b) => b.slot);
  const blockValues = PRIVACY_BLOCKS.map((b) => {
    const parts = [
      lit(contentBlockId("privacy", b.slot)),
      "'privacy'",
      lit(b.slot),
      lit(b.label),
      lit(b.title),
      lit(b.lead),
      jsonbLit(b.body),
      jsonbLit(b.extra),
    ];
    return `  (\n    ${parts.join(",\n    ")}\n  )`;
  }).join(",\n");

  return `-- 015 — the privacy page's SEO row and its thirteen content blocks (E17 / D-021).
--
-- 🔴 WHAT THIS FIXES. Production was seeded on 2026-10-08, BEFORE E17 added the
-- privacy page. The result is a database that two parts of this codebase already
-- disagree with:
--
--   · \`scripts/seed/snapshot.ts#pageMetaSeeds()\` returns TEN rows — the nine
--     routes present at frontend 2fdf32a plus \`privacy\` — and
--     \`scripts/seed.ts\` asserts \`page_meta: 10\`. Production holds NINE.
--   · \`scripts/seed/stage-s3.ts\` seeds the thirteen \`page = 'privacy'\`
--     \`content_blocks\` rows and asserts they are present. Production holds
--     NONE, so \`GET /api/content-blocks?page=privacy\` returns an empty list and
--     \`privacyReadiness().exists\` is false.
--
-- The visible consequence is in the frontend's content gate: check 11 of
-- \`scripts/verify-content-switch.mjs\` requires ten \`page-meta\` entries, so a
-- regeneration from production fails there.
--
-- Re-running the seed stages is the wrong instrument. S1 and S3 are declarative
-- reconcilers — they \`ON CONFLICT (id) DO UPDATE\` every row they own, which
-- would overwrite any administrator edit made since the seed. This migration is
-- the targeted alternative: it adds only the rows that are missing.
--
-- 🔴 ADDITIVE ONLY, BY CONSTRUCTION.
--   · No DDL. No UPDATE. No DELETE. Nothing existing is read for modification.
--   · Both inserts are \`ON CONFLICT DO NOTHING\` with NO conflict target, so
--     they yield to the primary key AND to \`page_meta_page_key\` /
--     \`content_blocks_page_slot_key\`. A row that already exists — seeded, or
--     since edited by an administrator — is left exactly as it is.
--   · The primary keys are the same deterministic UUIDv5 values the seed would
--     compute (\`pageMetaId('privacy')\`, \`contentBlockId('privacy', slot)\`), so a
--     later S1 or S3 run matches these rows on \`id\` instead of colliding on the
--     unique index.
--
-- 🔴 NOTHING HERE IS INVENTED, AND THE POLICY DOES NOT GO LIVE.
-- The prose is the approved draft (\`docs/PRIVACY-POLICY-DRAFT.md\`), derived
-- mechanically from \`scripts/seed/privacy-blocks.ts\` by
-- \`scripts/emit-migration-015.mts\`. ${String(markerCount)} of the ${String(PRIVACY_BLOCKS.length)} slots still carry the literal
-- \`${UNKNOWN_MARKER}\`, one per unresolved legal or
-- business fact, because only the clinic can state them (D-021, blocker B10).
-- While any marker survives, \`emitPageCopy\` withholds the ENTIRE privacy page
-- from the generated content, \`privacyPublished\` stays \`false\`, and \`/privacy\`
-- answers not-found with no footer link and no sitemap entry. The page_meta row
-- is therefore metadata for a page that is deliberately not yet published.
--
-- The \`page_meta\` row carries a canonical path only: its title and description
-- are NULL so \`metadataFor()\` falls back to the site-wide template rather than
-- to SEO text nobody wrote.
--
-- Rollback: delete the fourteen rows this inserts and the ledger row.
--   DELETE FROM content_blocks WHERE page = 'privacy';
--   DELETE FROM page_meta      WHERE page = 'privacy';
--   DELETE FROM _migrations    WHERE version = '015';
-- Safe because every one of them is created here; none is referenced by a
-- foreign key, and \`content_block_items\` has no privacy rows.

-- ---------------------------------------------------------------------------
-- 1. page_meta — the privacy route's SEO row.
-- ---------------------------------------------------------------------------

INSERT INTO page_meta (id, page, title, description, canonical, og_media_id, noindex)
VALUES (
  ${lit(pageMetaId("privacy"))},
  'privacy',
  ${lit(privacyMeta.title)},
  ${lit(privacyMeta.description)},
  ${lit(privacyMeta.canonical)},
  NULL,
  false
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. content_blocks — the ${String(PRIVACY_BLOCKS.length)} privacy slots.
-- ---------------------------------------------------------------------------
-- Every \`cta_*\` column stays NULL: a legal page has no call to action, which
-- also satisfies \`content_blocks_cta_label_needs_href\` (migration 013) and
-- \`content_blocks_cta2_needs_cta\` without further thought.
--
-- The rows actually inserted are captured so the marker assertion below can be
-- scoped to THEM. Asserting over the whole privacy page instead would make this
-- migration fail the day the client resolves a fact — the opposite of the
-- failure it is meant to catch.

CREATE TEMP TABLE _m015_inserted (id uuid NOT NULL) ON COMMIT DROP;

WITH ins AS (
  INSERT INTO content_blocks (id, page, slot, label, title, lead, body, extra)
  VALUES
${blockValues}
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
  IF privacy_blocks <> ${String(PRIVACY_BLOCKS.length)} THEN
    RAISE EXCEPTION
      'content_blocks should hold exactly ${String(PRIVACY_BLOCKS.length)} privacy rows after migration 015, found %',
      privacy_blocks;
  END IF;

  -- Present AND correctly keyed: a slot typo would show up here as a missing
  -- expected slot rather than as a page that renders with a hole in it.
  SELECT string_agg(expected.slot, ', ' ORDER BY expected.slot) INTO missing
    FROM (VALUES
${slots.map((s) => `      (${lit(s)})`).join(",\n")}
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

  IF inserted = ${String(PRIVACY_BLOCKS.length)} THEN
    SELECT count(*) INTO inserted_marked
      FROM content_blocks b
      JOIN _m015_inserted i ON i.id = b.id
     WHERE (coalesce(b.label, '') || coalesce(b.title, '') || coalesce(b.lead, '')
            || coalesce(b.body::text, '') || coalesce(b.extra::text, ''))
           LIKE '%' || ${lit(UNKNOWN_MARKER)} || '%';

    IF inserted_marked <> ${String(markerCount)} THEN
      RAISE EXCEPTION
        'expected ${String(markerCount)} of the newly inserted privacy slots to still carry "%", found %',
        ${lit(UNKNOWN_MARKER)}, inserted_marked;
    END IF;

    RAISE NOTICE
      'migration 015: inserted % privacy content_blocks, % still awaiting client input',
      inserted, inserted_marked;
  ELSIF inserted = 0 THEN
    RAISE NOTICE 'migration 015: privacy content already present — nothing inserted';
  ELSE
    RAISE NOTICE
      'migration 015: inserted % of ${String(PRIVACY_BLOCKS.length)} privacy content_blocks; the rest already existed',
      inserted;
  END IF;
END $m015$;

COMMENT ON TABLE page_meta IS
  'Per-page SEO. TEN rows: the nine routes present at frontend 2fdf32a plus '
  '\`privacy\`, whose row is canonical-only so the title and description fall '
  'back to the site-wide template (E17, migration 015). \`/services/[slug]\` is a '
  'template fed by \`services.seo_*\` and \`not-found\` exports no metadata, so '
  'neither has a row.';
`;
}

const sql = build();
const check = process.argv.includes("--check");

if (check) {
  let current: string;
  try {
    current = readFileSync(TARGET, "utf8");
  } catch {
    process.stderr.write(`${TARGET} does not exist — run without --check first.\n`);
    process.exitCode = 1;
    throw new Error("missing target");
  }
  if (current !== sql) {
    process.stderr.write(
      "migrations/015_privacy_page_content.sql does NOT match what the current sources emit.\n" +
        "If 015 is already applied this is expected after a later edit to privacy-blocks.ts —\n" +
        "add a NEW migration rather than re-emitting this one.\n",
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("015 matches its sources exactly.\n");
  }
} else {
  // LF only: .gitattributes pins every text file to LF, and the migration
  // runner checksums the raw bytes, so a CRLF write would change the checksum.
  writeFileSync(TARGET, sql, { encoding: "utf8" });
  process.stdout.write(`wrote ${TARGET}\n`);
}
