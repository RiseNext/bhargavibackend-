/**
 * The 26 in-use local assets — D-036.
 *
 * 10 services + 8 gallery + 4 why-us icons + 3 brand + 1 founder = 26.
 *
 * Excluded deliberately: the **19** unreferenced files in the snapshot, and the
 * favicon (`src/app/icon.png`), which is a Next.js build convention that stays
 * in the frontend repo and is not CMS media.
 *
 * The frontend public path → snapshot file mapping comes from the snapshot's own
 * ASSET-MANIFEST.json rather than being retyped — note that `/images/team/` maps
 * to `assets/founder/`, a rename that is easy to get wrong by hand.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SNAPSHOT_DIR, gallerySeeds, serviceSeeds, contentFileExports, siteSnapshot } from "./snapshot";

export type AssetFolder = "services" | "gallery" | "icons" | "brand" | "founder";

export interface AssetRef {
  /** The path the frontend currently references, e.g. `/images/services/x.jpg`. */
  publicPath: string;
  /** Path within the snapshot, e.g. `assets/services/x.jpg`. */
  snapshotPath: string;
  /** Absolute path on disk, for upload. */
  absolutePath: string;
  /** Cloudinary folder this belongs in. */
  folder: AssetFolder;
  /** Default alt text where one exists in the source. */
  altDefault: string | null;
}

/**
 * The manifest's real shape. Key names verified by reading
 * `assets/ASSET-MANIFEST.json`, not assumed — an earlier guess of
 * `sourcePath`/`snapshotPath` was wrong, and the thrown error below is what
 * caught it rather than six silently broken images.
 */
interface ManifestEntry {
  /** Frontend path, e.g. "/public/images/services/acupuncture.jpg". */
  original?: string;
  /** Snapshot path, e.g. "assets/services/acupuncture.jpg". */
  snapshot?: string;
  category?: string;
  /** "IN USE" or "UNREFERENCED" — the authority on the 26 vs 19 split. */
  status?: string;
  bytes?: number;
  sha256?: string;
  verified?: boolean;
}

function manifest(): ManifestEntry[] {
  const raw = readFileSync(resolve(SNAPSHOT_DIR, "assets", "ASSET-MANIFEST.json"), "utf8");
  const parsed = JSON.parse(raw) as Record<string, ManifestEntry>;
  return Object.values(parsed);
}

/**
 * Resolves a frontend public path to its snapshot copy using the manifest.
 *
 * The manifest records `sourcePath` as `/public/images/...`, so the lookup is a
 * suffix match on the public path. A miss throws: a silently unmapped asset
 * would become a broken image with a green build.
 */
function resolveViaManifest(publicPath: string, entries: ManifestEntry[]): string {
  const needle = `/public${publicPath}`;

  for (const entry of entries) {
    if (entry.original === needle && typeof entry.snapshot === "string") {
      return entry.snapshot;
    }
  }

  throw new Error(
    `Asset "${publicPath}" is not in the snapshot ASSET-MANIFEST.json — ` +
      "it cannot be migrated to Cloudinary, and referencing it would break an image.",
  );
}

function folderOf(snapshotPath: string): AssetFolder {
  const match = /^assets\/(services|gallery|icons|brand|founder)\//.exec(snapshotPath);
  if (!match || !match[1]) {
    throw new Error(`Cannot classify snapshot asset "${snapshotPath}"`);
  }
  return match[1] as AssetFolder;
}

/** The complete, ordered inventory. Exactly 26 entries. */
export function assetInventory(): AssetRef[] {
  const entries = manifest();
  const site = siteSnapshot();
  const refs: AssetRef[] = [];

  const add = (publicPath: string, altDefault: string | null): void => {
    const snapshotPath = resolveViaManifest(publicPath, entries);
    refs.push({
      publicPath,
      snapshotPath,
      absolutePath: resolve(SNAPSHOT_DIR, snapshotPath),
      folder: folderOf(snapshotPath),
      altDefault,
    });
  };

  // 10 services — alt text is the service title, as the frontend renders today.
  for (const s of serviceSeeds()) add(s.imagePath, s.title);

  // 8 gallery photos — their authored (templated) alt text (D-003).
  for (const g of gallerySeeds()) add(g.imagePath, g.alt);

  // 4 why-us icons.
  for (const w of contentFileExports().whyChooseUs) add(w.icon, w.title);

  // 3 brand assets.
  add(site.logo, `${site.name} emblem`);
  add(site.logoLockup, `${site.name} logo`);
  add(site.ogImage, `${site.name} social preview card`);

  // 1 founder portrait.
  add(site.founder.photo, `${site.founder.honorific} ${site.founder.name}`);

  if (refs.length !== 26) {
    throw new Error(
      `Asset inventory produced ${String(refs.length)} entries, expected 26 (D-036). ` +
        "Either an asset has been added to the frontend or the mapping is wrong.",
    );
  }

  // Cross-check against the manifest's own IN USE marker rather than trusting
  // the count alone. D-036 fixed this at 26 after an earlier draft said 20 —
  // which would have shipped six broken images — so it is worth verifying from
  // two independent directions.
  const inUse = entries.filter((e) => e.status === "IN USE").length;
  if (inUse !== refs.length) {
    throw new Error(
      `The snapshot manifest marks ${String(inUse)} assets "IN USE" but the inventory built ` +
        `${String(refs.length)}. One of them is wrong; do not migrate until they agree.`,
    );
  }

  return refs;
}

/** Cloudinary folder names, kept separate from the snapshot's own layout. */
export const CLOUDINARY_FOLDERS: Record<AssetFolder, string> = {
  services: "services",
  gallery: "gallery",
  icons: "icons",
  brand: "brand",
  founder: "brand",
};
