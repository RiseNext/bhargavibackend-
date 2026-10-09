/**
 * Seed stage S3 — page copy. ✅ Unblocked by **D-037**.
 *
 *   content_blocks       41  (D-036 count; D-037 settled the exact list)
 *   content_block_items  17  total — **14 here**, and the three D-027 image
 *                            rows from stage S2
 *
 * S3 refuses to run before S2 because those three rows need S2's `media`. The
 * guard lives in the runner; this module assumes it has passed.
 *
 * Nothing here is retyped. Every value is derived from the immutable snapshot by
 * `content-blocks.ts`, which asserts the distribution and fails loudly if a
 * snapshot change drifts it — D-003 makes this production content, so a typo
 * would be a visible change on the live site.
 */

import type { Client } from "pg";
import {
  EXPECTED_BLOCK_COUNT,
  EXPECTED_ITEM_COUNT_S3,
  deriveContentBlockItems,
  deriveContentBlocks,
} from "./content-blocks";
import { contentBlockId, contentBlockItemId } from "./ids";
import {
  EXPECTED_PRIVACY_BLOCK_COUNT,
  EXPECTED_PRIVACY_SLOTS_WITH_MARKERS,
  PRIVACY_BLOCKS,
} from "./privacy-blocks";
import { UNKNOWN_MARKER } from "../../src/lib/content/privacy";
import type { StageCounts } from "./stage-s1";

export async function runStageS3(client: Client): Promise<StageCounts> {
  const { blocks, problems: blockProblems } = deriveContentBlocks();
  const { items, problems: itemProblems } = deriveContentBlockItems();

  const problems = [...blockProblems, ...itemProblems];
  if (problems.length > 0) {
    // Refuse rather than seed a drifted set. The alternative is 41 rows that
    // look right and render differently.
    throw new Error(
      `Stage S3 refuses to run — the derivation does not match the approved shape:\n  - ${problems.join(
        "\n  - ",
      )}`,
    );
  }

  // content_blocks first: items reference them.
  for (const b of blocks) {
    await client.query(
      `INSERT INTO content_blocks (
         id, page, slot, label, title, lead, body,
         cta_label, cta_href, cta2_label, cta2_href, extra
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         page = EXCLUDED.page,
         slot = EXCLUDED.slot,
         label = EXCLUDED.label,
         title = EXCLUDED.title,
         lead = EXCLUDED.lead,
         body = EXCLUDED.body,
         cta_label = EXCLUDED.cta_label,
         cta_href = EXCLUDED.cta_href,
         cta2_label = EXCLUDED.cta2_label,
         cta2_href = EXCLUDED.cta2_href,
         extra = EXCLUDED.extra`,
      [
        contentBlockId(b.page, b.slot),
        b.page,
        b.slot,
        b.label,
        b.title,
        b.lead,
        b.body === null ? null : JSON.stringify(b.body),
        b.ctaLabel,
        b.ctaHref,
        b.cta2Label,
        b.cta2Href,
        b.extra === null ? null : JSON.stringify(b.extra),
      ],
    );
  }

  for (const i of items) {
    await client.query(
      `INSERT INTO content_block_items (
         id, block_id, group_key, sort_order, item_type,
         label, value, text, href, icon_key, lines
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         block_id = EXCLUDED.block_id,
         group_key = EXCLUDED.group_key,
         sort_order = EXCLUDED.sort_order,
         item_type = EXCLUDED.item_type,
         label = EXCLUDED.label,
         value = EXCLUDED.value,
         text = EXCLUDED.text,
         href = EXCLUDED.href,
         icon_key = EXCLUDED.icon_key,
         lines = EXCLUDED.lines`,
      [
        contentBlockItemId(i.page, i.slot, i.groupKey, i.sortOrder),
        contentBlockId(i.page, i.slot),
        i.groupKey,
        i.sortOrder,
        i.itemType,
        i.label,
        i.value,
        i.text,
        i.href,
        i.iconKey,
        i.lines === null ? null : JSON.stringify(i.lines),
      ],
    );
  }

  // ── Privacy policy (E17 / D-021) ──────────────────────────────────────────
  //
  // Additive, and the first page that is NOT derived from the snapshot: the
  // policy is new content rather than migrated copy. It seeds with ten
  // deliberately unresolved `UNKNOWN — CLIENT INPUT REQUIRED` facts, and the
  // generator refuses to emit the page while any of them survive.
  for (const b of PRIVACY_BLOCKS) {
    await client.query(
      `INSERT INTO content_blocks (id, page, slot, label, title, lead, body, extra)
       VALUES ($1,'privacy',$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         slot = EXCLUDED.slot,
         label = EXCLUDED.label,
         title = EXCLUDED.title,
         lead = EXCLUDED.lead,
         body = EXCLUDED.body,
         extra = EXCLUDED.extra`,
      [
        contentBlockId("privacy", b.slot),
        b.slot,
        b.label,
        b.title,
        b.lead,
        b.body === null ? null : JSON.stringify(b.body),
        b.extra === null ? null : JSON.stringify(b.extra),
      ],
    );
  }

  const privacyPresent = await client.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM content_blocks WHERE page = 'privacy'",
  );
  if (Number(privacyPresent.rows[0]?.n ?? "0") !== EXPECTED_PRIVACY_BLOCK_COUNT) {
    throw new Error(
      `Expected ${String(EXPECTED_PRIVACY_BLOCK_COUNT)} privacy content_blocks after S3, ` +
        `found ${String(privacyPresent.rows[0]?.n)}.`,
    );
  }

  // 🔴 The markers must still be there. If a transcription slip dropped one,
  // the policy would become "publishable" without the client having supplied
  // the fact — the page would then go live stating something nobody approved.
  const markerSlots = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM content_blocks
      WHERE page = 'privacy'
        AND (coalesce(label,'') || coalesce(title,'') || coalesce(lead,'')
             || coalesce(body::text,'') || coalesce(extra::text,'')) LIKE '%' || $1 || '%'`,
    [UNKNOWN_MARKER],
  );
  if (Number(markerSlots.rows[0]?.n ?? "0") !== EXPECTED_PRIVACY_SLOTS_WITH_MARKERS) {
    throw new Error(
      `Expected ${String(EXPECTED_PRIVACY_SLOTS_WITH_MARKERS)} privacy slot(s) to still carry ` +
        `"${UNKNOWN_MARKER}", found ${String(markerSlots.rows[0]?.n)}. A missing marker means a ` +
        "client fact was invented or silently dropped.",
    );
  }

  // Count what is actually in the table, not what we believed we inserted —
  // an upsert that silently matched nothing would otherwise report success.
  const blockCount = await client.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM content_blocks",
  );
  const itemCount = await client.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM content_block_items",
  );

  const actualBlocks = Number(blockCount.rows[0]?.n ?? "0");
  const actualItems = Number(itemCount.rows[0]?.n ?? "0");

  // Verify the DERIVED slots specifically, rather than asserting a global total.
  //
  // The 41 is the count of EXISTING page copy migrated from the snapshot. New
  // pages — `privacy` is the first, and it is additive content gated on client
  // approval (B10) — legitimately add rows beyond it. A global `=== 41` would
  // start failing the moment one was seeded, which is the wrong failure: it
  // would block a correct change rather than catch an incorrect one.
  const derivedKeys = blocks.map((b) => `${b.page}.${b.slot}`);
  const present = await client.query<{ key: string }>(
    `SELECT page || '.' || slot AS key FROM content_blocks WHERE page || '.' || slot = ANY($1::text[])`,
    [derivedKeys],
  );

  if (present.rows.length !== EXPECTED_BLOCK_COUNT) {
    throw new Error(
      `Only ${String(present.rows.length)} of the ${String(EXPECTED_BLOCK_COUNT)} derived ` +
        `content_blocks rows are present after S3 (table holds ${String(actualBlocks)} in total).`,
    );
  }

  return {
    content_blocks: actualBlocks,
    // S2 contributes the three D-027 image rows; when S2 has run this is 18.
    content_block_items: actualItems,
    content_block_items_s3: EXPECTED_ITEM_COUNT_S3,
  };
}
