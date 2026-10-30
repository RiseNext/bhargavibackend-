/**
 * The HOME HERO's image collection — the data invariants the restored editor
 * relies on.
 *
 * 🔴 WHY THIS SUITE EXISTS. `service_images` had
 * `tests/service-images.integration.test.ts` from the day it was added.
 * `content_block_items` — the table that actually holds the HOMEPAGE HERO
 * photograph (D-027, widened to a collection by D-044) — had none, even though
 * it is the same four operations behind the same screen. The gap mattered:
 * nothing asserted what happens when the collection is emptied, which is the
 * state that made the hero editor disappear, and nothing asserted that the
 * asset behind the live hero cannot be destroyed while it is in use.
 *
 * Asserted against a real database because every guarantee here is enforced by
 * the SCHEMA — a partial unique index, an alt-not-blank CHECK, a CASCADE and
 * the media reference guard — not by handler code.
 *
 * ⚠ Gated on REACHABILITY, not on `DATABASE_URL` being set, for the reason
 * `service-images.integration.test.ts` documents at length: `describeDb` tests
 * only whether the variable exists, so with `.env.test` present and no
 * Postgres listening it reports ECONNREFUSED failures instead of skipping.
 *
 * Never pointed at Neon — `tests/setup.ts` refuses a non-localhost
 * `DATABASE_URL` outright, because the helpers TRUNCATE every table they find.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isDbReachable, seedStageS1 } from "./helpers/db";
import { closeDb, query, queryOne } from "@/lib/db";
import { mediaReferences } from "@/lib/media";

const GROUP = "images";

async function makeMedia(publicId: string): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO media (public_id, resource_type, delivery_type, visibility,
                        format, bytes, width, height, secure_url, folder)
     VALUES ($1, 'image', 'upload', 'public', 'webp', 12345, 1600, 1200,
             $2, 'brand')
     RETURNING id::text AS id`,
    [publicId, `https://res.cloudinary.com/demo/image/upload/${publicId}.webp`],
  );
  if (!row) throw new Error("could not insert test media");
  return row.id;
}

/** The `home.hero` block. Seeded by stage S3, so this suite makes its own. */
async function heroBlock(): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO content_blocks (page, slot, label, title)
     VALUES ('home', 'hero', 'Wellness', 'A test hero title')
     ON CONFLICT (page, slot) DO UPDATE SET title = EXCLUDED.title
     RETURNING id::text AS id`,
  );
  if (!row) throw new Error("could not create the home.hero block");
  return row.id;
}

async function addImage(
  blockId: string,
  mediaId: string,
  alt: string,
  sortOrder: number,
  isDefault = false,
  groupKey: string = GROUP,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO content_block_items
       (block_id, group_key, item_type, media_id, alt, sort_order, is_default)
     VALUES ($1, $2, 'image', $3, $4, $5, $6)
     RETURNING id::text AS id`,
    [blockId, groupKey, mediaId, alt, sortOrder, isDefault],
  );
  if (!row) throw new Error("could not insert test block item");
  return row.id;
}

const describeIfDb = (await isDbReachable()) ? describe : describe.skip;

describeIfDb("the home hero's image collection", () => {
  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await seedStageS1();
    await query("DELETE FROM content_block_items WHERE alt LIKE 'CBI test%'");
    await query("DELETE FROM media WHERE public_id LIKE 'cbi-test/%'");
  });

  it("🔴 allows at most ONE main image per group", async () => {
    const block = await heroBlock();
    const a = await makeMedia("cbi-test/a");
    const b = await makeMedia("cbi-test/b");

    await addImage(block, a, "CBI test one", 1, true);

    // The partial unique index `content_block_items_one_default_idx` is the
    // enforcement. Two mains would make the opening frame depend on row order.
    await expect(addImage(block, b, "CBI test two", 2, true)).rejects.toThrow(
      /content_block_items_one_default_idx|duplicate key/i,
    );
  });

  it("allows ZERO main images — the section then opens on the first by sort_order", async () => {
    const block = await heroBlock();
    const a = await makeMedia("cbi-test/a");
    const b = await makeMedia("cbi-test/b");
    await addImage(block, a, "CBI test one", 1);
    await addImage(block, b, "CBI test two", 2);

    const rows = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM content_block_items
        WHERE block_id = $1 AND group_key = $2 AND is_default`,
      [block, GROUP],
    );
    expect(rows[0]?.n).toBe("0");
  });

  it("scopes the one-main rule per GROUP, not per block", async () => {
    // A slot may hold `images`, `rows` and `bulletList` independently, and each
    // is its own ordered list with its own main.
    const block = await heroBlock();
    const a = await makeMedia("cbi-test/a");
    const b = await makeMedia("cbi-test/b");

    await addImage(block, a, "CBI test one", 1, true, "images");
    await expect(
      addImage(block, b, "CBI test two", 1, true, "secondary"),
    ).resolves.toBeTruthy();
  });

  it("an image row cannot be stored with blank alt text", async () => {
    const block = await heroBlock();
    const a = await makeMedia("cbi-test/a");
    // `content_block_items_image_has_alt` — an unlabelled photograph on the
    // most prominent section of the site is an accessibility defect.
    await expect(addImage(block, a, "   ", 1)).rejects.toThrow(
      /content_block_items_image_has_alt|violates check constraint/i,
    );
  });

  it("reordering persists, and is readable back in the new order", async () => {
    const block = await heroBlock();
    const a = await makeMedia("cbi-test/a");
    const b = await makeMedia("cbi-test/b");
    const first = await addImage(block, a, "CBI test one", 1);
    const second = await addImage(block, b, "CBI test two", 2);

    // The same statement `reorderBlockItems` runs: positions from the array.
    await query(
      `UPDATE content_block_items AS i SET sort_order = o.position
         FROM (SELECT id, row_number() OVER () AS position
                 FROM unnest($1::uuid[]) AS id) AS o
        WHERE i.id = o.id`,
      [[second, first]],
    );

    const rows = await query<{ alt: string }>(
      `SELECT alt FROM content_block_items
        WHERE block_id = $1 AND group_key = $2 AND item_type = 'image'
        ORDER BY sort_order, id`,
      [block, GROUP],
    );
    expect(rows.map((r) => r.alt)).toEqual(["CBI test two", "CBI test one"]);
  });

  /**
   * 🔴 THE INCIDENT'S DATA SHAPE. Removing the last image deletes the ITEM and
   * leaves the `content_blocks` row untouched — the slot still exists, still
   * has its heading and lead, and is still reachable at
   * `/admin/page-copy/home/hero`.
   *
   * That is precisely why the screen had to stop deriving its editors from the
   * rows it found: the collection still belongs to the slot when it is empty.
   * `tests/admin-screens-render.test.ts` asserts the rendered consequence.
   */
  it("🔴 emptying the collection leaves the SLOT intact — only the item goes", async () => {
    const block = await heroBlock();
    const a = await makeMedia("cbi-test/a");
    const only = await addImage(block, a, "CBI test one", 1);

    await query("DELETE FROM content_block_items WHERE id = $1", [only]);

    const slot = await queryOne<{ id: string; title: string | null }>(
      "SELECT id::text AS id, title FROM content_blocks WHERE page = 'home' AND slot = 'hero'",
    );
    expect(slot, "the slot must survive its last image being removed").not.toBeNull();
    expect(slot?.id).toBe(block);

    const remaining = await query(
      "SELECT 1 FROM content_block_items WHERE block_id = $1 AND item_type = 'image'",
      [block],
    );
    expect(remaining).toHaveLength(0);
  });

  /**
   * 🔴 THE RECOVERY-SAFETY GUARANTEE. Deleting an asset in the admin panel is a
   * soft delete PLUS an irreversible Cloudinary destroy, so `ON DELETE SET
   * NULL` on this column never fires on that path — the guard is the only
   * protection. If it failed to report the hero, an editor could destroy the
   * homepage photograph itself, and then no amount of restoring rows would
   * bring the picture back.
   *
   * `content_block_items.media_id` is registered as "page sections"; this
   * asserts the behaviour, not just the list.
   */
  it("🔴 refuses to report the hero's asset as unused while it is in use", async () => {
    const block = await heroBlock();
    const a = await makeMedia("cbi-test/a");
    await addImage(block, a, "CBI test one", 1);

    const refs = await mediaReferences(a);
    expect(refs.join(" "), "the hero's asset must be reported as referenced").toMatch(
      /page sections/i,
    );
  });

  it("reports an unreferenced asset as free, so the library stays tidyable", async () => {
    const spare = await makeMedia("cbi-test/spare");
    expect(await mediaReferences(spare)).toEqual([]);
  });
});
