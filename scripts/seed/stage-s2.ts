/**
 * Seed stage S2 — D-032, and the order inside it matters.
 *
 *   media 26
 *     → gallery_images 8            (media_id is NOT NULL — this is why S2 exists)
 *     → backfill services.image_media_id            10
 *     → backfill content_list_items.icon_media_id    4
 *     → backfill site_settings.{logo,logo_lockup,og,founder_photo}  4
 *     → the 3 D-027 content_block_items image rows (Q-013 / D-041)
 *
 * Reads the upload manifest written by `scripts/migrate-assets.ts`. Keeping the
 * upload and the insert in separate steps means a failed upload never leaves
 * half-populated media rows, and the insert is replayable without re-uploading.
 *
 * ⚠ FOUR rows, not three — D-027's prose and blueprint §G both say "three" and
 * both are wrong. The reasoning is at `deriveImageItems`' call site below; do
 * not "correct" this back to three.
 *
 * 🔴 The four D-027 rows need their `content_blocks` parents, which S3 creates.
 * S2 therefore creates the two parent slots it needs (`home.hero`, `home.intro`)
 * if they are absent, and S3 upserts over them — rather than S2 failing or S3
 * being forced to run first, which would reintroduce the ordering problem
 * D-032 solved.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { assetInventory } from "./assets";
import { deriveImageItems } from "./content-blocks";
import { contentFileExports, gallerySeeds, serviceSeeds, siteSnapshot } from "./snapshot";
import { contentBlockId, contentBlockItemId, contentListId, galleryId, mediaId, serviceId } from "./ids";
import type { StageCounts } from "./stage-s1";

const ROOT = resolve(import.meta.dirname, "..", "..");
export const MANIFEST_PATH = resolve(ROOT, ".media-manifest.json");

/**
 * One uploaded asset, as verified server-side through Cloudinary's Admin API.
 * Nothing here is trusted from a browser.
 */
export interface UploadedAsset {
  publicPath: string;
  publicId: string;
  resourceType: "image" | "raw";
  deliveryType: "upload" | "authenticated";
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  secureUrl: string | null;
  version: string | null;
  etag: string | null;
  originalFilename: string | null;
  folder: string;
  altDefault: string | null;
}

export interface MediaManifest {
  uploadedAt: string;
  cloudName: string;
  assets: UploadedAsset[];
}

export function isStageS2Possible(): boolean {
  return existsSync(MANIFEST_PATH);
}

export function readManifest(): MediaManifest {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      `No media manifest at ${MANIFEST_PATH}. Run \`npm run assets:migrate\` first — ` +
        "it uploads the 26 in-use assets to Cloudinary and records the verified metadata S2 needs.",
    );
  }

  const parsed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as MediaManifest;

  if (parsed.assets.length !== 26) {
    throw new Error(
      `Media manifest contains ${String(parsed.assets.length)} assets, expected 26 (D-036).`,
    );
  }

  // The inventory is the authority on WHICH assets must exist; the manifest only
  // supplies their uploaded metadata. A mismatch means an asset was missed.
  const expected = new Set(assetInventory().map((a) => a.publicPath));
  const got = new Set(parsed.assets.map((a) => a.publicPath));

  for (const path of expected) {
    if (!got.has(path)) throw new Error(`Media manifest is missing asset "${path}"`);
  }

  return parsed;
}

export async function runStageS2(client: Client): Promise<StageCounts> {
  const { assets } = readManifest();

  const counts: StageCounts = {
    media: await insertMedia(client, assets),
    gallery_images: await insertGallery(client),
    services_backfilled: await backfillServices(client),
    content_list_items_backfilled: await backfillIcons(client),
    site_settings_backfilled: await backfillSiteSettings(client),
    content_block_items_d027: await insertD027Items(client),
  };

  return counts;
}

async function insertMedia(client: Client, assets: UploadedAsset[]): Promise<number> {
  for (const a of assets) {
    await client.query(
      `INSERT INTO media (
         id, provider, public_id, resource_type, delivery_type, visibility,
         format, bytes, width, height, secure_url, version, etag,
         original_filename, alt_default, folder, uploaded_by
       ) VALUES ($1,'cloudinary',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NULL)
       ON CONFLICT (id) DO UPDATE SET
         public_id = EXCLUDED.public_id,
         resource_type = EXCLUDED.resource_type,
         delivery_type = EXCLUDED.delivery_type,
         visibility = EXCLUDED.visibility,
         format = EXCLUDED.format,
         bytes = EXCLUDED.bytes,
         width = EXCLUDED.width,
         height = EXCLUDED.height,
         secure_url = EXCLUDED.secure_url,
         version = EXCLUDED.version,
         etag = EXCLUDED.etag,
         original_filename = EXCLUDED.original_filename,
         alt_default = EXCLUDED.alt_default,
         folder = EXCLUDED.folder`,
      [
        mediaId(a.publicPath),
        a.publicId,
        a.resourceType,
        a.deliveryType,
        a.deliveryType === "upload" ? "public" : "private",
        a.format,
        a.bytes,
        a.width,
        a.height,
        // The CHECK constraint enforces this too, but being explicit here means
        // a bad manifest fails on the row it belongs to.
        a.deliveryType === "upload" ? a.secureUrl : null,
        a.version,
        a.etag,
        a.originalFilename,
        a.altDefault,
        a.folder,
      ],
    );
  }

  return assets.length;
}

async function insertGallery(client: Client): Promise<number> {
  const rows = gallerySeeds();

  for (const g of rows) {
    await client.query(
      `INSERT INTO gallery_images (id, media_id, alt, sort_order, published)
       VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (id) DO UPDATE SET
         media_id = EXCLUDED.media_id,
         alt = EXCLUDED.alt,
         sort_order = EXCLUDED.sort_order,
         published = EXCLUDED.published`,
      [galleryId(g.sortOrder), mediaId(g.imagePath), g.alt, g.sortOrder],
    );
  }

  return rows.length;
}

async function backfillServices(client: Client): Promise<number> {
  const rows = serviceSeeds();
  let updated = 0;

  for (const s of rows) {
    const res = await client.query(
      "UPDATE services SET image_media_id = $2 WHERE id = $1",
      [serviceId(s.slug), mediaId(s.imagePath)],
    );
    updated += res.rowCount ?? 0;
  }

  return updated;
}

async function backfillIcons(client: Client): Promise<number> {
  const icons = contentFileExports().whyChooseUs;
  let updated = 0;

  for (const [index, w] of icons.entries()) {
    const res = await client.query(
      "UPDATE content_list_items SET icon_media_id = $2 WHERE id = $1",
      [contentListId("why_choose_us", index + 1), mediaId(w.icon)],
    );
    updated += res.rowCount ?? 0;
  }

  return updated;
}

/**
 * 🔴 X-25: the generator FAILS THE BUILD if any of these four is still NULL.
 * Header, Footer, Preloader and every OG card depend on them, and a silently
 * missing logo with a green build is worse than a failed build.
 */
async function backfillSiteSettings(client: Client): Promise<number> {
  const site = siteSnapshot();

  const res = await client.query(
    `UPDATE site_settings SET
       logo_media_id = $1,
       logo_lockup_media_id = $2,
       og_media_id = $3,
       founder_photo_media_id = $4
     WHERE id = 1`,
    [
      mediaId(site.logo),
      mediaId(site.logoLockup),
      mediaId(site.ogImage),
      mediaId(site.founder.photo),
    ],
  );

  if ((res.rowCount ?? 0) !== 1) {
    throw new Error("site_settings row is missing — stage S1 has not run");
  }

  // Four columns on one row; the count the stage reports is columns backfilled.
  return 4;
}

/**
 * ✅ D-027 — the inline home-page images become `content_block_items` rows with
 * their own authored alt text.
 *
 * 🔵 **Four rows, not three.** D-027's prose and blueprint §G both say "three",
 * but the authoritative D-024 table says `home.hero → images` 2 and
 * `home.intro → images` 2, the snapshot holds four entries each with its own
 * authored alt, and the arithmetic settles it: the approved item total is 18,
 * the four non-image groups derive to 14, and 14 + 3 = 17 (Q-013 / D-041).
 *
 * 🔴 Every value is READ FROM THE SNAPSHOT. An earlier draft of this function
 * invented three rows by picking plausible assets and reusing other alt text —
 * which would have shown the wrong images and fabricated alt text, breaking the
 * no-hallucination rule in the one place a reviewer would be least likely to
 * check.
 *
 * The two parent slots are created minimally here so S2 does not depend on S3;
 * S3 then upserts over them with the full copy.
 */
async function insertD027Items(client: Client): Promise<number> {
  const { images, problems } = deriveImageItems();

  if (problems.length > 0) {
    throw new Error(
      `Stage S2 refuses to seed the D-027 image rows:\n  - ${problems.join("\n  - ")}`,
    );
  }

  // Parent slots. S3 fills in label/title/lead/CTAs.
  for (const slot of new Set(images.map((i) => `${i.page}.${i.slot}`))) {
    const [page, name] = slot.split(".");
    if (!page || !name) continue;
    await client.query(
      `INSERT INTO content_blocks (id, page, slot) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO NOTHING`,
      [contentBlockId(page, name), page, name],
    );
  }

  for (const image of images) {
    await client.query(
      `INSERT INTO content_block_items (
         id, block_id, group_key, sort_order, item_type, label, media_id, alt
       ) VALUES ($1,$2,$3,$4,'image',$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         block_id = EXCLUDED.block_id,
         group_key = EXCLUDED.group_key,
         sort_order = EXCLUDED.sort_order,
         item_type = EXCLUDED.item_type,
         label = EXCLUDED.label,
         media_id = EXCLUDED.media_id,
         alt = EXCLUDED.alt`,
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

  return images.length;
}
