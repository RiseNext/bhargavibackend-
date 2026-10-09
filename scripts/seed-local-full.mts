/**
 * Local development seed — S1, a SYNTHETIC S2, and S3.
 *
 * ⚠ **Development and verification only. Never run against staging or
 * production.**
 *
 * Stage S2 needs Cloudinary, which is still a parked blocker (§31 forbids
 * assuming provider behaviour). But the generator cannot be verified end to end
 * without media, because it correctly FAILS THE BUILD when a brand image is
 * missing (X-25).
 *
 * So this inserts media rows shaped exactly as the real S2 produces them, with
 * Cloudinary-form URLs pointing at Cloudinary's public demo cloud. What that
 * exercises is the GENERATOR and the emission contract — not the provider. The
 * real S2 remains the only path that creates production media, and it refuses
 * to run without a verified upload manifest.
 *
 * The URLs are obviously-synthetic on purpose: anything that looked like a real
 * clinic asset could be mistaken for migrated data.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { withDirectClient, withMigrationLock } from "../src/lib/db-direct";
import { runStageS1 } from "./seed/stage-s1";
import { runStageS3 } from "./seed/stage-s3";
import { MANIFEST_PATH } from "./seed/stage-s2";
import { assetInventory } from "./seed/assets";
import { deriveImageItems } from "./seed/content-blocks";
import {
  contentBlockId,
  contentBlockItemId,
  contentListId,
  galleryId,
  mediaId,
  serviceId,
} from "./seed/ids";
import {
  contentFileExports,
  gallerySeeds,
  serviceSeeds,
  siteSnapshot,
} from "./seed/snapshot";

const ROOT = resolve(import.meta.dirname, "..");

function loadEnvFile(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(ROOT, file);
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
}

/** Mirrors stage S2's inserts, with synthetic Cloudinary metadata. */
async function syntheticStageS2(client: Client): Promise<number> {
  const assets = assetInventory();

  for (const [index, asset] of assets.entries()) {
    const publicId = `bhw-local/${asset.folder}/${String(index).padStart(2, "0")}`;

    await client.query(
      `INSERT INTO media (
         id, provider, public_id, resource_type, delivery_type, visibility,
         format, bytes, width, height, secure_url, version, etag,
         original_filename, alt_default, folder, uploaded_by
       ) VALUES ($1,'cloudinary',$2,'image','upload','public','jpg',120000,1600,1067,$3,'v1','local',$4,$5,$6,NULL)
       ON CONFLICT (id) DO UPDATE SET
         public_id = EXCLUDED.public_id,
         secure_url = EXCLUDED.secure_url,
         alt_default = EXCLUDED.alt_default,
         folder = EXCLUDED.folder`,
      [
        mediaId(asset.publicPath),
        publicId,
        // Cloudinary's documented public demo cloud — visibly not the clinic's.
        `https://res.cloudinary.com/demo/image/upload/v1/${publicId}.jpg`,
        asset.publicPath.split("/").pop() ?? null,
        asset.altDefault,
        asset.folder,
      ],
    );
  }

  // Order matters exactly as in S2: media → gallery → backfills → D-027 items.
  for (const g of gallerySeeds()) {
    await client.query(
      `INSERT INTO gallery_images (id, media_id, alt, sort_order, published)
       VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (id) DO UPDATE SET media_id = EXCLUDED.media_id, alt = EXCLUDED.alt`,
      [galleryId(g.sortOrder), mediaId(g.imagePath), g.alt, g.sortOrder],
    );
  }

  for (const s of serviceSeeds()) {
    await client.query("UPDATE services SET image_media_id = $2 WHERE id = $1", [
      serviceId(s.slug),
      mediaId(s.imagePath),
    ]);
  }

  for (const [index, w] of contentFileExports().whyChooseUs.entries()) {
    await client.query("UPDATE content_list_items SET icon_media_id = $2 WHERE id = $1", [
      contentListId("why_choose_us", index + 1),
      mediaId(w.icon),
    ]);
  }

  const site = siteSnapshot();
  await client.query(
    `UPDATE site_settings SET logo_media_id = $1, logo_lockup_media_id = $2,
            og_media_id = $3, founder_photo_media_id = $4 WHERE id = 1`,
    [
      mediaId(site.logo),
      mediaId(site.logoLockup),
      mediaId(site.ogImage),
      mediaId(site.founder.photo),
    ],
  );

  // The four D-027 image rows, read from the snapshot — never invented.
  const { images, problems } = deriveImageItems();
  if (problems.length > 0) throw new Error(problems.join("; "));

  for (const slot of new Set(images.map((i) => `${i.page}.${i.slot}`))) {
    const [page, name] = slot.split(".");
    if (!page || !name) continue;
    await client.query(
      "INSERT INTO content_blocks (id, page, slot) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING",
      [contentBlockId(page, name), page, name],
    );
  }

  for (const image of images) {
    await client.query(
      `INSERT INTO content_block_items (
         id, block_id, group_key, sort_order, item_type, label, media_id, alt
       ) VALUES ($1,$2,$3,$4,'image',$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET media_id = EXCLUDED.media_id, alt = EXCLUDED.alt`,
      [
        contentBlockItemId(image.page, image.slot, image.groupKey, image.sortOrder),
        contentBlockId(image.page, image.slot),
        image.groupKey,
        image.sortOrder,
        image.label,
        mediaId(image.imagePath),
        image.alt,
      ],
    );
  }

  return assets.length;
}

async function main(): Promise<void> {
  loadEnvFile();

  const url = process.env.DATABASE_URL_UNPOOLED ?? "";
  // A crude but effective guard: refuse anything that looks remote.
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(
      "Refusing to run: DATABASE_URL_UNPOOLED does not point at localhost.\n" +
        "This script inserts SYNTHETIC media and must never touch staging or production.",
    );
  }

  /**
   * 🔴 NEVER OVERWRITE REAL MEDIA.
   *
   * `syntheticStageS2` upserts on the deterministic `mediaId(publicPath)`, so it
   * REPLACES `public_id` and `secure_url` on rows that already exist. Run on a
   * database that holds migrated media and it silently swaps real Cloudinary
   * URLs for `demo`-cloud placeholders — the exact state that put 125 broken
   * images on the public site. The localhost guard above does not help, because
   * a local database is precisely where real media gets reconciled and the
   * frontend content gets generated from.
   *
   * Two independent refusals, because either signal alone is sufficient:
   *   · a verified upload manifest exists → the real S2 can and should run;
   *   · the database already holds media on some other cloud → real data.
   */
  if (existsSync(MANIFEST_PATH) && !process.argv.includes("--allow-overwrite-real")) {
    throw new Error(
      `Refusing to run: a verified upload manifest exists at ${MANIFEST_PATH}.\n\n` +
        "Real assets have been uploaded, so synthetic media is not needed and would\n" +
        "overwrite them with Cloudinary demo-cloud URLs. Use the real path instead:\n\n" +
        "    npm run seed -- --stage s2\n\n" +
        "If you genuinely want placeholders on this database, pass --allow-overwrite-real.",
    );
  }

  await withDirectClient(async (client) => {
    // The second refusal — checked before anything is written. A media row that
    // is NOT on the demo cloud is real, reconciled data.
    const real = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM media
        WHERE secure_url IS NOT NULL
          AND secure_url NOT LIKE 'https://res.cloudinary.com/demo/%'`,
    );
    if (Number(real.rows[0]?.n ?? "0") > 0 && !process.argv.includes("--allow-overwrite-real")) {
      throw new Error(
        `Refusing to run: this database already holds ${real.rows[0].n} media row(s) that are ` +
          "not demo-cloud placeholders.\n\n" +
          "Overwriting them would replace real Cloudinary URLs with demo ones and break every\n" +
          "image the generated content points at. Nothing has been changed.\n\n" +
          "Pass --allow-overwrite-real only if you intend to discard that reconciled media.",
      );
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS _seed_stages (
        stage text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now(),
        counts jsonb NOT NULL
      )
    `);

    await withMigrationLock(client, async () => {
      await client.query("BEGIN");
      try {
        const s1 = await runStageS1(client);
        process.stdout.write(`  S1  ${String(Object.keys(s1).length)} table(s) seeded\n`);

        const media = await syntheticStageS2(client);
        process.stdout.write(`  S2  ${String(media)} SYNTHETIC media row(s) + gallery + backfills\n`);

        // S3's own guard reads this ledger.
        await client.query(
          `INSERT INTO _seed_stages (stage, counts) VALUES ('s1', $1), ('s2', $2)
           ON CONFLICT (stage) DO UPDATE SET counts = EXCLUDED.counts, applied_at = now()`,
          [JSON.stringify(s1), JSON.stringify({ media, synthetic: true })],
        );

        const s3 = await runStageS3(client);
        process.stdout.write(
          `  S3  ${String(s3.content_blocks)} content_blocks, ${String(s3.content_block_items)} items\n`,
        );

        await client.query(
          `INSERT INTO _seed_stages (stage, counts) VALUES ('s3', $1)
           ON CONFLICT (stage) DO UPDATE SET counts = EXCLUDED.counts, applied_at = now()`,
          [JSON.stringify(s3)],
        );

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  });

  process.stdout.write(
    "\n✅ Local dataset ready.\n" +
      "⚠ The media rows are SYNTHETIC. Real media requires Cloudinary and stage S2.\n",
  );
}

main().catch((err: unknown) => {
  process.stderr.write(
    `\nseed-local-full: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
