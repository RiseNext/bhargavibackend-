/**
 * E8 — upload the 26 in-use frontend images to Cloudinary and record the
 * VERIFIED metadata that seed stage S2 needs.
 *
 * Upload and insert are deliberately separate steps (D-032): a failed upload
 * never leaves half-populated `media` rows, and the insert replays from the
 * manifest without re-uploading.
 *
 * 🔴 Idempotent by construction. Each asset gets a DETERMINISTIC `public_id`
 * derived from the path the frontend already references, uploaded with
 * `overwrite`. Re-running produces the same public_ids and the same manifest
 * rather than 26 more copies — which matters because `media.public_id` is what
 * every generated image URL is built from.
 *
 * 🔴 Every upload is SIGNED server-side (D-014). No unsigned preset, ever.
 *
 * 🔴 `max_bytes` is NOT sent. Cloudinary excludes it from its string-to-sign
 * and ignores it when sent unsigned — both verified (D-039 C-1). The real size
 * control is the post-upload Admin API check below.
 *
 * Post-upload verification is mandatory (D-014): the browser is never trusted,
 * and here neither is the upload response. Every asset is re-read through the
 * Admin API and checked before it reaches the manifest.
 *
 *   npm run assets:migrate              # dev prefix (bhw/dev)
 *   npm run assets:migrate -- --prefix bhw/prod
 *   npm run assets:migrate -- --dry-run
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { assetInventory, CLOUDINARY_FOLDERS, type AssetRef } from "./seed/assets";
import { MANIFEST_PATH, type MediaManifest, type UploadedAsset } from "./seed/stage-s2";
import {
  adminApiAuthHeader,
  cloudinaryConfig,
  isCloudinaryConfigured,
  signParams,
} from "../src/lib/cloudinary/client";

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

/** Images only — these 26 are all website imagery. No SVG (D-018). */
const ALLOWED_FORMATS = "jpg,jpeg,png,webp,avif";

/** 8 MB, enforced here rather than by the provider (D-039 C-1). */
const MAX_BYTES = 8 * 1024 * 1024;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

/**
 * `bhw/dev` locally, `bhw/prod` in production.
 *
 * Derived from NODE_ENV rather than a new environment variable — every env var
 * in this project has to be justified, and a prefix that follows the
 * environment it is already running in needs no second source of truth.
 */
function prefix(): string {
  const index = args.indexOf("--prefix");
  if (index !== -1) {
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error("--prefix needs a value, e.g. --prefix bhw/prod");
    }
    return value.replace(/\/+$/, "");
  }
  return process.env.NODE_ENV === "production" ? "bhw/prod" : "bhw/dev";
}

/**
 * A stable Cloudinary `public_id` for an asset.
 *
 * Derived from the path the frontend already uses, so it is reproducible from
 * the repository alone — not from a stored mapping that could drift. The
 * extension is dropped because Cloudinary carries `format` separately for
 * images and would otherwise fold it into the id.
 */
function publicIdFor(asset: AssetRef, root: string): string {
  const folder = CLOUDINARY_FOLDERS[asset.folder];
  const stem = basename(asset.publicPath).replace(/\.[a-z0-9]+$/i, "");
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${root}/${folder}/${slug}`;
}

interface AdminResource {
  public_id?: string;
  resource_type?: string;
  type?: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  secure_url?: string;
  version?: number;
  etag?: string;
  original_filename?: string;
}

async function uploadSigned(asset: AssetRef, publicId: string): Promise<AdminResource> {
  const cfg = cloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);

  // 🔴 Exactly the parameters Cloudinary includes in its signature. Adding
  // max_bytes here produces `401 Invalid Signature` (D-039 C-1).
  const toSign: Record<string, string | number | boolean> = {
    public_id: publicId,
    overwrite: true,
    allowed_formats: ALLOWED_FORMATS,
    timestamp,
  };

  const form = new FormData();
  for (const [k, v] of Object.entries(toSign)) form.append(k, String(v));
  form.append("api_key", cfg.apiKey);
  form.append("signature", signParams(toSign, cfg.apiSecret));
  form.append("file", new Blob([readFileSync(asset.absolutePath)]), basename(asset.publicPath));

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as AdminResource & {
    error?: { message?: string };
  };

  if (res.status !== 200 || !json.public_id) {
    throw new Error(
      `Upload failed for ${asset.publicPath} (${String(res.status)}): ${json.error?.message ?? "no public_id returned"}`,
    );
  }
  return json;
}

/**
 * Re-reads the asset through the Admin API and checks it.
 *
 * 🔴 D-014 requires post-upload verification. The upload response is not
 * trusted as the record: this is the value that reaches the database.
 */
async function verify(publicId: string, asset: AssetRef): Promise<AdminResource> {
  const cfg = cloudinaryConfig();
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cfg.cloudName}/resources/image/upload/${encodeURIComponent(publicId)}`,
    { headers: { Authorization: adminApiAuthHeader() } },
  );
  if (res.status !== 200) {
    throw new Error(`Admin API verification failed for ${publicId}: ${String(res.status)}`);
  }
  const r = (await res.json()) as AdminResource;

  const problems: string[] = [];
  if (r.public_id !== publicId) problems.push(`public_id is "${String(r.public_id)}"`);
  if (r.resource_type !== "image") problems.push(`resource_type is "${String(r.resource_type)}"`);
  if (r.type !== "upload") problems.push(`delivery type is "${String(r.type)}"`);
  if (!ALLOWED_FORMATS.split(",").includes(String(r.format))) {
    problems.push(`format "${String(r.format)}" is not allowlisted`);
  }
  if (typeof r.bytes !== "number" || r.bytes <= 0) problems.push("bytes is missing");
  if (typeof r.bytes === "number" && r.bytes > MAX_BYTES) {
    problems.push(`bytes ${String(r.bytes)} exceeds the ${String(MAX_BYTES)} limit`);
  }
  if (typeof r.width !== "number" || typeof r.height !== "number") {
    problems.push("width/height missing — the image was not decoded");
  }

  if (problems.length > 0) {
    throw new Error(`Verification failed for ${asset.publicPath}:\n  - ${problems.join("\n  - ")}`);
  }
  return r;
}

async function main(): Promise<void> {
  loadEnvFile();

  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and " +
        "CLOUDINARY_API_SECRET — see docs/CLOUDINARY-SETUP.md.",
    );
  }

  const root = prefix();
  const inventory = assetInventory();

  // The inventory already cross-checks itself against the snapshot manifest's
  // own "IN USE" count, so a wrong number here means the snapshot changed.
  if (inventory.length !== 26) {
    throw new Error(`Expected 26 in-use assets (D-036), inventory has ${String(inventory.length)}.`);
  }

  const missing = inventory.filter((a) => !existsSync(a.absolutePath));
  if (missing.length > 0) {
    throw new Error(
      `${String(missing.length)} asset(s) are missing from the snapshot on disk:\n  - ${missing
        .map((m) => m.publicPath)
        .join("\n  - ")}`,
    );
  }

  process.stdout.write(`\nE8 · uploading ${String(inventory.length)} assets under "${root}/"\n`);
  if (dryRun) process.stdout.write("DRY RUN — nothing will be uploaded\n");
  process.stdout.write("\n");

  const assets: UploadedAsset[] = [];

  for (const [index, asset] of inventory.entries()) {
    const publicId = publicIdFor(asset, root);
    const n = `${String(index + 1).padStart(2)}/26`;

    if (dryRun) {
      process.stdout.write(`  ${n}  ${asset.publicPath}\n        -> ${publicId}\n`);
      continue;
    }

    await uploadSigned(asset, publicId);
    const v = await verify(publicId, asset);

    assets.push({
      publicPath: asset.publicPath,
      publicId,
      resourceType: "image",
      deliveryType: "upload",
      format: String(v.format),
      bytes: Number(v.bytes),
      width: typeof v.width === "number" ? v.width : null,
      height: typeof v.height === "number" ? v.height : null,
      secureUrl: v.secure_url ?? null,
      version: v.version === undefined ? null : String(v.version),
      etag: v.etag ?? null,
      originalFilename: v.original_filename ?? null,
      folder: CLOUDINARY_FOLDERS[asset.folder],
      altDefault: asset.altDefault,
    });

    process.stdout.write(
      `  ${n}  ${asset.publicPath}\n        -> ${publicId}  ${String(v.format)} ${String(v.width)}x${String(v.height)} ${String(v.bytes)}B\n`,
    );
  }

  if (dryRun) {
    process.stdout.write("\nDry run complete — no manifest written.\n\n");
    return;
  }

  const manifest: MediaManifest = {
    uploadedAt: new Date().toISOString(),
    cloudName: cloudinaryConfig().cloudName,
    assets,
  };

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(
    `\n${String(assets.length)} asset(s) uploaded and verified.\nManifest: ${MANIFEST_PATH}\n` +
      "Next: npm run seed -- --stage s2\n\n",
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`
assets:migrate: ${err instanceof Error ? err.message : String(err)}
`);
  process.exitCode = 1;
});
